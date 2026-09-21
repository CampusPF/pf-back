import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { EVENTS, QuizPassedEvent } from '../events';
import { Quiz } from './entities/quiz.entity';
import { Question } from './entities/question.entity';
import { Option } from './entities/option.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Actor, assertCourseOwner } from '../common/utils/assert-course-owner.util';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { CreateOptionDto } from './dto/create-option.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { QuestionWithOptions, StudentQuizDto } from './dto/student-quiz.dto';
import { TeacherQuizDto } from './dto/teacher-quiz.dto';
import { CourseCheckpointDto } from './dto/course-checkpoint.dto';
import { QuizAttemptDetailDto, QuizAttemptResultDto } from './dto/quiz-attempt-result.dto';
import { CourseProgressionService } from '../course-progression/course-progression.service';

const NOT_FOUND_MESSAGE = 'Checkpoint no encontrado';
const UNANSWERED = 'Sin responder';

/**
 * Checkpoints (quiz multiple choice por módulo, o de fin de curso con
 * `moduleId` null).
 *
 * Un quiz es VIGENTE si tiene al menos una pregunta y no cuelga de un módulo
 * dado de baja. Sólo los vigentes se listan, se pueden rendir y cuentan para
 * el certificado: un quiz vacío o de un módulo borrado no puede dejar al
 * alumno bloqueado para siempre.
 */
@Injectable()
export class QuizzesService {
    private readonly logger = new Logger(QuizzesService.name);

    constructor(
        @InjectRepository(Quiz)
        private readonly quizzesRepository: Repository<Quiz>,
        @InjectRepository(Question)
        private readonly questionsRepository: Repository<Question>,
        @InjectRepository(Option)
        private readonly optionsRepository: Repository<Option>,
        @InjectRepository(QuizAttempt)
        private readonly attemptsRepository: Repository<QuizAttempt>,
        @InjectRepository(Course)
        private readonly coursesRepository: Repository<Course>,
        @InjectRepository(CourseModuleEntity)
        private readonly courseModulesRepository: Repository<CourseModuleEntity>,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
        private readonly dataSource: DataSource,
        private readonly eventEmitter: EventEmitter2,
        private readonly progression: CourseProgressionService,
    ) { }

    // ─── Alumno ────────────────────────────────────────────────────────────

    /**
     * El quiz para rendir, sin `isCorrect`. Lo ve el alumno inscripto y, como
     * vista previa, el docente dueño. Cualquier otro caso es 404: no se
     * distingue "no existe" de "no es tuyo".
     */
    async findForStudent(quizId: string, actor: Actor): Promise<StudentQuizDto> {
        const quiz = await this.findQuizWithCourse(quizId);
        const questions = await this.loadQuestions(quizId);
        if (!this.isActive(quiz, questions.length)) throw new NotFoundException(NOT_FOUND_MESSAGE);

        const isOwner = quiz.course?.instructor?.id === actor.id;
        if (!isOwner) {
            await this.assertEnrolled(actor.id, quiz.courseId);
            /* No alcanza con estar inscripto: hay que haber llegado hasta acá.
               Sin esto, el que tiene el id del quiz lo abre salteándose las
               lecciones y los módulos anteriores.

               Es el gate de ABRIR, no el de rendir: uno ya aprobado se puede
               volver a ver, pero no volver a rendir (ver submitAttempt). */
            await this.progression.assertCanOpen(actor, quiz.courseId, quizId);
        }

        return StudentQuizDto.from(
            quiz,
            questions,
            await this.progression.attemptsFor(actor.id, quizId),
        );
    }

    /** Los checkpoints vigentes de un curso y si el usuario ya aprobó cada uno. */
    async findCourseCheckpoints(courseId: string, userId: string): Promise<CourseCheckpointDto[]> {
        const quizzes = await this.findActiveQuizzes(courseId);
        if (quizzes.length === 0) return [];

        const passed = await this.passedQuizIds(userId, quizzes.map((quiz) => quiz.id));

        return quizzes.map((quiz) => ({
            quizId: quiz.id,
            moduleId: quiz.moduleId,
            moduleOrder: quiz.module?.order ?? null,
            title: quiz.title,
            passed: passed.has(quiz.id),
        }));
    }

    /**
     * Corrige un intento en el servidor. Las respuestas tienen que ser de
     * preguntas de ESTE quiz y cada opción de SU pregunta: si no, 400 (nunca
     * se corrige contra datos que manda el cliente).
     */
    async submitAttempt(
        quizId: string,
        actor: Actor,
        dto: SubmitAttemptDto,
    ): Promise<QuizAttemptResultDto> {
        const userId = actor.id;
        const quiz = await this.findQuizWithCourse(quizId);
        const questions = await this.loadQuestions(quizId);
        if (!this.isActive(quiz, questions.length)) throw new NotFoundException(NOT_FOUND_MESSAGE);
        await this.assertEnrolled(userId, quiz.courseId);

        /* Se vuelve a chequear al enviar, no sólo al abrir: entre que se cargó
           la pantalla y se mandan las respuestas pueden haberse agotado los
           intentos —o haberse aprobado el checkpoint— en otra pestaña. */
        await this.progression.assertCanSubmit(actor, quiz.courseId, quizId);

        const selectedByQuestion = this.validateAnswers(questions, dto);

        const details: QuizAttemptDetailDto[] = questions.map((question) => {
            const selected = selectedByQuestion.get(question.id);
            const correctOption = question.options.find((option) => option.isCorrect);
            return {
                questionId: question.id,
                questionText: question.text,
                correct: !!selected && selected.id === correctOption?.id,
                selectedOptionText: selected?.text ?? UNANSWERED,
                correctOptionText: correctOption?.text,
            };
        });

        const correctCount = details.filter((detail) => detail.correct).length;
        const totalQuestions = questions.length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const passed = score >= quiz.passingScore;

        await this.attemptsRepository.save(
            this.attemptsRepository.create({
                userId,
                quizId,
                // Snapshot de lo respondido: [{ questionId, optionId }].
                answers: dto.answers.map(({ questionId, optionId }) => ({
                    questionId,
                    optionId,
                })) as unknown as Record<string, unknown>,
                score,
                passed,
            }),
        );

        // La correcta se revela sólo si aprobó: si no, reintentar sería copiar.
        if (!passed) details.forEach((detail) => delete detail.correctOptionText);

        if (passed) {
            this.eventEmitter.emit(
                EVENTS.QUIZ_PASSED,
                new QuizPassedEvent(userId, quizId, quiz.courseId, score),
            );

            /* Este checkpoint puede haber sido lo último que faltaba: el curso
               son las lecciones al 100% Y todos los checkpoints aprobados, así
               que terminarlo también puede pasar desde acá y no sólo al marcar
               una lección. Si falla, el intento ya está guardado igual. */
            await this.progression
                .settleCourseCompletion(userId, quiz.courseId)
                .catch((error: unknown) => {
                    this.logger.error(
                        `No se pudo resolver si ${userId} terminó el curso ${quiz.courseId}`,
                        error instanceof Error ? error.stack : String(error),
                    );
                });
        }

        // Se relee DESPUÉS de guardar: es el número con este intento ya
        // descontado, que es el que la pantalla necesita para decidir si
        // todavía ofrece reintentar.
        const { attemptsLeft } = await this.progression.attemptsFor(userId, quizId);

        return {
            score,
            passed,
            passingScore: quiz.passingScore,
            correctCount,
            totalQuestions,
            attemptsLeft,
            details,
        };
    }

    /**
     * true si el usuario aprobó TODOS los checkpoints vigentes del curso (los
     * de módulo y el de fin de curso). Un curso sin checkpoints → true.
     */
    async hasPassedAllQuizzes(userId: string, courseId: string): Promise<boolean> {
        const quizzes = await this.findActiveQuizzes(courseId);
        if (quizzes.length === 0) return true;

        const passed = await this.passedQuizIds(userId, quizzes.map((quiz) => quiz.id));
        return quizzes.every((quiz) => passed.has(quiz.id));
    }

    // ─── Docente dueño ─────────────────────────────────────────────────────

    async create(dto: CreateQuizDto, actor: Actor): Promise<TeacherQuizDto> {
        const course = await this.coursesRepository.findOne({
            where: { id: dto.courseId },
            relations: { instructor: true },
        });
        if (!course) throw new NotFoundException(`Curso con id ${dto.courseId} no encontrado`);
        assertCourseOwner(course, actor);

        const moduleId = dto.moduleId ?? null;
        let courseModule: CourseModuleEntity | null = null;
        if (moduleId) {
            courseModule = await this.courseModulesRepository.findOne({
                where: { id: moduleId, course: { id: course.id } },
            });
            if (!courseModule) {
                throw new BadRequestException('El módulo no pertenece a este curso');
            }
        }

        // Uno por módulo (y uno solo de fin de curso). No hay constraint en la
        // base: se valida acá.
        const duplicated = await this.quizzesRepository.exists({
            where: { courseId: course.id, moduleId: moduleId ?? IsNull() },
        });
        if (duplicated) {
            throw new ConflictException(
                moduleId
                    ? 'Este módulo ya tiene un checkpoint'
                    : 'Este curso ya tiene un checkpoint de fin de curso',
            );
        }

        const questions = dto.questions ?? [];
        questions.forEach((question) => this.assertValidOptions(question.options));

        const quiz = await this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Quiz, {
                courseId: course.id,
                moduleId,
                title: dto.title,
                passingScore: dto.passingScore ?? 70,
            });
            for (const [index, question] of questions.entries()) {
                await this.insertQuestion(manager, saved.id, question, question.order ?? index + 1);
            }
            return saved;
        });

        quiz.module = courseModule;
        return this.toTeacherDto(quiz);
    }

    /**
     * TODOS los quizzes del curso con `isCorrect`, para el editor del temario.
     * A diferencia de findActiveQuizzes incluye los vacíos: un checkpoint recién
     * creado no tiene preguntas y el docente tiene que verlo para cargarlas.
     */
    async findCourseQuizzesForTeacher(courseId: string, actor: Actor): Promise<TeacherQuizDto[]> {
        const course = await this.coursesRepository.findOne({
            where: { id: courseId },
            relations: { instructor: true },
        });
        if (!course) throw new NotFoundException(`Curso con id ${courseId} no encontrado`);
        assertCourseOwner(course, actor);

        const quizzes = await this.quizzesRepository.find({
            where: { courseId },
            relations: { module: true },
        });
        quizzes.sort(
            (a, b) =>
                (a.module?.order ?? Number.MAX_SAFE_INTEGER) -
                (b.module?.order ?? Number.MAX_SAFE_INTEGER),
        );

        return Promise.all(quizzes.map((quiz) => this.toTeacherDto(quiz)));
    }

    /** El quiz con `isCorrect`, para editarlo. */
    async findForTeacher(quizId: string, actor: Actor): Promise<TeacherQuizDto> {
        const quiz = await this.findOwnedQuiz(quizId, actor);
        return this.toTeacherDto(quiz);
    }

    async update(quizId: string, dto: UpdateQuizDto, actor: Actor): Promise<TeacherQuizDto> {
        const quiz = await this.findOwnedQuiz(quizId, actor);

        const changes: Partial<Pick<Quiz, 'title' | 'passingScore'>> = {};
        if (dto.title !== undefined) changes.title = dto.title;
        if (dto.passingScore !== undefined) changes.passingScore = dto.passingScore;
        if (Object.keys(changes).length > 0) {
            await this.quizzesRepository.update(quiz.id, changes);
        }

        return this.toTeacherDto({ ...quiz, ...changes });
    }

    /** Borrado físico: el cascade se lleva preguntas, opciones e intentos. */
    async remove(quizId: string, actor: Actor): Promise<void> {
        const quiz = await this.findOwnedQuiz(quizId, actor);
        await this.quizzesRepository.delete(quiz.id);
    }

    async addQuestion(
        quizId: string,
        dto: CreateQuestionDto,
        actor: Actor,
    ): Promise<TeacherQuizDto> {
        const quiz = await this.findOwnedQuiz(quizId, actor);
        this.assertValidOptions(dto.options);

        let order = dto.order;
        if (order === undefined) {
            const last = await this.questionsRepository.findOne({
                where: { quizId: quiz.id },
                order: { order: 'DESC' },
            });
            order = last ? last.order + 1 : 1;
        }

        const questionOrder = order;
        await this.dataSource.transaction((manager) =>
            this.insertQuestion(manager, quiz.id, dto, questionOrder),
        );

        return this.toTeacherDto(quiz);
    }

    /** Si viene `options`, reemplaza el set completo. */
    async updateQuestion(
        quizId: string,
        questionId: string,
        dto: UpdateQuestionDto,
        actor: Actor,
    ): Promise<TeacherQuizDto> {
        const quiz = await this.findOwnedQuiz(quizId, actor);
        await this.findQuestionOfQuiz(quiz.id, questionId);
        if (dto.options !== undefined) this.assertValidOptions(dto.options);

        await this.dataSource.transaction(async (manager) => {
            const changes: Partial<Pick<Question, 'text' | 'order'>> = {};
            if (dto.text !== undefined) changes.text = dto.text;
            if (dto.order !== undefined) changes.order = dto.order;
            if (Object.keys(changes).length > 0) {
                await manager.update(Question, questionId, changes);
            }

            if (dto.options !== undefined) {
                await manager.delete(Option, { questionId });
                await manager.save(Option, this.toOptionRows(questionId, dto.options));
            }
        });

        return this.toTeacherDto(quiz);
    }

    async removeQuestion(
        quizId: string,
        questionId: string,
        actor: Actor,
    ): Promise<TeacherQuizDto> {
        const quiz = await this.findOwnedQuiz(quizId, actor);
        await this.findQuestionOfQuiz(quiz.id, questionId);
        await this.questionsRepository.delete(questionId);
        return this.toTeacherDto(quiz);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private async findQuizWithCourse(quizId: string): Promise<Quiz> {
        const quiz = await this.quizzesRepository.findOne({
            where: { id: quizId },
            // course.instructor: lo necesita assertCourseOwner / la vista previa del dueño.
            relations: { module: true, course: { instructor: true } },
        });
        if (!quiz) throw new NotFoundException(NOT_FOUND_MESSAGE);
        return quiz;
    }

    private async findOwnedQuiz(quizId: string, actor: Actor): Promise<Quiz> {
        const quiz = await this.findQuizWithCourse(quizId);
        assertCourseOwner(quiz.course, actor);
        return quiz;
    }

    private async findQuestionOfQuiz(quizId: string, questionId: string): Promise<Question> {
        const question = await this.questionsRepository.findOne({
            where: { id: questionId, quizId },
        });
        if (!question) throw new NotFoundException('Pregunta no encontrada en este checkpoint');
        return question;
    }

    /** Preguntas por `order_index`, cada una con sus opciones. */
    private async loadQuestions(quizId: string): Promise<QuestionWithOptions[]> {
        const questions = await this.questionsRepository.find({
            where: { quizId },
            order: { order: 'ASC' },
        });
        if (questions.length === 0) return [];

        const options = await this.optionsRepository.find({
            where: { questionId: In(questions.map((question) => question.id)) },
            order: { id: 'ASC' },
        });

        return questions.map((question) => ({
            ...question,
            options: options.filter((option) => option.questionId === question.id),
        }));
    }

    private isActive(quiz: Quiz, questionCount: number): boolean {
        const moduleAlive = quiz.moduleId === null || quiz.module?.isActive === true;
        return moduleAlive && questionCount > 0;
    }

    /**
     * Los checkpoints vigentes de un curso: los de módulo en el orden del
     * temario, y el de fin de curso al final.
     */
    private async findActiveQuizzes(courseId: string): Promise<Quiz[]> {
        const quizzes = await this.quizzesRepository.find({
            where: { courseId },
            relations: { module: true },
        });
        const candidates = quizzes.filter(
            (quiz) => quiz.moduleId === null || quiz.module?.isActive === true,
        );
        if (candidates.length === 0) return [];

        const withQuestions = await this.questionsRepository.find({
            where: { quizId: In(candidates.map((quiz) => quiz.id)) },
            select: { quizId: true },
        });
        const nonEmpty = new Set(withQuestions.map((question) => question.quizId));

        return candidates
            .filter((quiz) => nonEmpty.has(quiz.id))
            .sort(
                (a, b) =>
                    (a.module?.order ?? Number.MAX_SAFE_INTEGER) -
                    (b.module?.order ?? Number.MAX_SAFE_INTEGER),
            );
    }

    private async passedQuizIds(userId: string, quizIds: string[]): Promise<Set<string>> {
        const attempts = await this.attemptsRepository.find({
            where: { userId, quizId: In(quizIds), passed: true },
            select: { quizId: true },
        });
        return new Set(attempts.map((attempt) => attempt.quizId));
    }

    private async assertEnrolled(userId: string, courseId: string): Promise<void> {
        const enrolled = await this.enrollmentsRepository.exists({
            where: { student: { id: userId }, course: { id: courseId }, isActive: true },
        });
        if (!enrolled) throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    /** Devuelve, por pregunta, la opción elegida. Rechaza con 400 lo que no es de este quiz. */
    private validateAnswers(
        questions: QuestionWithOptions[],
        dto: SubmitAttemptDto,
    ): Map<string, Option> {
        const questionsById = new Map(questions.map((question) => [question.id, question]));
        const selected = new Map<string, Option>();

        for (const answer of dto.answers) {
            const question = questionsById.get(answer.questionId);
            if (!question) {
                throw new BadRequestException(
                    `La pregunta ${answer.questionId} no pertenece a este checkpoint`,
                );
            }
            if (selected.has(question.id)) {
                throw new BadRequestException(
                    `La pregunta ${answer.questionId} está respondida más de una vez`,
                );
            }
            const option = question.options.find((item) => item.id === answer.optionId);
            if (!option) {
                throw new BadRequestException(
                    `La opción ${answer.optionId} no corresponde a la pregunta ${answer.questionId}`,
                );
            }
            selected.set(question.id, option);
        }

        return selected;
    }

    /** Segunda barrera, por si el service se llama sin pasar por el ValidationPipe. */
    private assertValidOptions(options: CreateOptionDto[] | undefined): void {
        if (!options || options.length < 2) {
            throw new BadRequestException('Cada pregunta tiene que tener al menos 2 opciones');
        }
        if (options.filter((option) => option.isCorrect === true).length !== 1) {
            throw new BadRequestException(
                'Cada pregunta tiene que tener exactamente una opción correcta',
            );
        }
    }

    private async insertQuestion(
        manager: EntityManager,
        quizId: string,
        dto: CreateQuestionDto,
        order: number,
    ): Promise<void> {
        const question = await manager.save(Question, { quizId, text: dto.text, order });
        await manager.save(Option, this.toOptionRows(question.id, dto.options));
    }

    private toOptionRows(questionId: string, options: CreateOptionDto[]) {
        return options.map((option) => ({
            questionId,
            text: option.text,
            isCorrect: option.isCorrect,
        }));
    }

    private async toTeacherDto(quiz: Quiz): Promise<TeacherQuizDto> {
        return TeacherQuizDto.from(quiz, await this.loadQuestions(quiz.id));
    }
}
