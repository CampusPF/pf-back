import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Quiz } from '../quizzes/entities/quiz.entity';
import { Question } from '../quizzes/entities/question.entity';
import { QuizAttempt } from '../quizzes/entities/quiz-attempt.entity';
import { UserRole } from '../users/entities/user.entity';
import { EVENTS, CourseCompletedEvent } from '../events';

/**
 * Cuántas veces se puede rendir un mismo checkpoint.
 *
 * OJO: agotar los intentos sin aprobar deja al alumno sin poder terminar el
 * curso ni emitir el certificado, porque `hasPassedAllQuizzes` nunca va a dar
 * true. Hoy no hay forma de resetear un intento desde el panel del docente:
 * si se quiere permitir reintentar, hay que agregarla.
 */
export const MAX_ATTEMPTS_PER_QUIZ = 2;

/** Quién pregunta. El rol importa: docente dueño y admin no se bloquean. */
export interface ProgressionActor {
    id: string;
    role?: UserRole;
}

/** El estado de un módulo dentro de la progresión secuencial del curso. */
export interface ModuleGate {
    moduleId: string;
    order: number;
    title: string;
    totalLessons: number;
    completedLessons: number;
    /** Todas las lecciones activas del módulo están completadas. */
    lessonsCompleted: boolean;
    /** Checkpoint vigente del módulo, si tiene. */
    quizId: string | null;
    quizPassed: boolean;
    attemptsUsed: number;
    attemptsLeft: number;
    /** Se puede entrar a las lecciones de este módulo. */
    lessonsUnlocked: boolean;
    /** Se puede rendir su checkpoint. */
    checkpointUnlocked: boolean;
    /** Por qué está bloqueado, para que el front lo diga en voz alta. */
    lockedReason: string | null;
}

/** El checkpoint de fin de curso: no cuelga de ningún módulo. */
export interface FinalCheckpointGate {
    quizId: string;
    passed: boolean;
    attemptsUsed: number;
    attemptsLeft: number;
    unlocked: boolean;
    lockedReason: string | null;
}

export interface CourseProgression {
    courseId: string;
    /** El actor pasa por encima de la progresión (admin o docente dueño). */
    bypassed: boolean;
    modules: ModuleGate[];
    finalCheckpoint: FinalCheckpointGate | null;
}

/**
 * Progresión secuencial de un curso.
 *
 * Una sola regla, en un solo lugar, para las tres preguntas que se hacen el
 * reproductor, el gate de contenido y el de checkpoints:
 *
 *  1. Las lecciones del módulo 1 están siempre abiertas.
 *  2. El checkpoint de un módulo se habilita cuando TODAS sus lecciones
 *     activas están completadas.
 *  3. El módulo siguiente se habilita cuando el anterior está cerrado:
 *     lecciones completas Y checkpoint aprobado (si tiene).
 *  4. El checkpoint de fin de curso se habilita con todos los módulos
 *     cerrados.
 *
 * Un módulo SIN checkpoint se cierra sólo con sus lecciones: si no, un curso
 * al que nunca se le cargaron quizzes quedaría trabado en el módulo 1.
 *
 * El admin y el docente que dicta el curso no pasan por nada de esto: tienen
 * que poder revisar el material sin cursarlo.
 */
@Injectable()
export class CourseProgressionService {
    constructor(
        @InjectRepository(CourseModuleEntity)
        private readonly modulesRepository: Repository<CourseModuleEntity>,
        @InjectRepository(Lesson)
        private readonly lessonsRepository: Repository<Lesson>,
        @InjectRepository(LessonProgress)
        private readonly progressRepository: Repository<LessonProgress>,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
        @InjectRepository(Quiz)
        private readonly quizzesRepository: Repository<Quiz>,
        @InjectRepository(Question)
        private readonly questionsRepository: Repository<Question>,
        @InjectRepository(QuizAttempt)
        private readonly attemptsRepository: Repository<QuizAttempt>,
        @InjectRepository(Course)
        private readonly coursesRepository: Repository<Course>,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    /** El estado completo de la progresión, para dibujar los candados. */
    async getProgression(actor: ProgressionActor, courseId: string): Promise<CourseProgression> {
        const bypassed = await this.canBypass(actor, courseId);

        const modules = await this.modulesRepository.find({
            where: { course: { id: courseId }, isActive: true },
            order: { order: 'ASC' },
        });

        const lessons = modules.length
            ? await this.lessonsRepository.find({
                where: { module: { id: In(modules.map((m) => m.id)) }, isActive: true },
                relations: { module: true },
                select: { id: true, module: { id: true } },
            })
            : [];

        const completed = await this.completedLessonIds(actor.id, courseId);
        const quizzes = await this.activeQuizzes(courseId);
        const attempts = await this.attemptsByQuiz(actor.id, quizzes.map((q) => q.id));
        const passed = await this.passedQuizIds(actor.id, quizzes.map((q) => q.id));

        const gates: ModuleGate[] = [];
        // Un módulo se abre si el anterior quedó cerrado. Arranca en true: el
        // primero no tiene nada delante.
        let previousCleared = true;

        for (const courseModule of modules) {
            const moduleLessons = lessons.filter((l) => l.module?.id === courseModule.id);
            const completedCount = moduleLessons.filter((l) => completed.has(l.id)).length;
            const lessonsCompleted = completedCount === moduleLessons.length;

            const quiz = quizzes.find((q) => q.moduleId === courseModule.id) ?? null;
            const quizPassed = quiz ? passed.has(quiz.id) : false;
            const used = quiz ? (attempts.get(quiz.id) ?? 0) : 0;

            const lessonsUnlocked = bypassed || previousCleared;
            /* Aprobado se puede reabrir SIEMPRE, aunque después desmarque una
               lección: haberlo aprobado ya prueba que en su momento las tenía
               todas hechas. Sin este `|| quizPassed`, desmarcar una lección
               dejaba el checkpoint aprobado devolviendo 403. */
            const checkpointUnlocked =
                Boolean(quiz) && (bypassed || (lessonsUnlocked && (lessonsCompleted || quizPassed)));

            gates.push({
                moduleId: courseModule.id,
                order: courseModule.order,
                title: courseModule.title,
                totalLessons: moduleLessons.length,
                completedLessons: completedCount,
                lessonsCompleted,
                quizId: quiz?.id ?? null,
                quizPassed,
                attemptsUsed: used,
                attemptsLeft: Math.max(0, MAX_ATTEMPTS_PER_QUIZ - used),
                lessonsUnlocked,
                checkpointUnlocked,
                lockedReason: lessonsUnlocked
                    ? null
                    : 'Terminá el módulo anterior y aprobá su checkpoint para desbloquearlo',
            });

            /* Qué cierra este módulo, para habilitar el siguiente:
               - con checkpoint, APROBARLO (y para aprobarlo ya hizo falta
                 tener las lecciones completas, así que no se vuelve a pedir);
               - sin checkpoint, completar sus lecciones.

               A propósito no se exige `lessonsCompleted` cuando hay checkpoint
               aprobado: si no, desmarcar una lección le sacaba al alumno el
               acceso a módulos que YA se había ganado. El progreso conseguido
               no se revoca hacia atrás. */
            previousCleared = previousCleared && (quiz ? quizPassed : lessonsCompleted);
        }

        const finalQuiz = quizzes.find((q) => q.moduleId === null) ?? null;
        const finalUsed = finalQuiz ? (attempts.get(finalQuiz.id) ?? 0) : 0;

        return {
            courseId,
            bypassed,
            modules: gates,
            finalCheckpoint: finalQuiz
                ? {
                    quizId: finalQuiz.id,
                    passed: passed.has(finalQuiz.id),
                    attemptsUsed: finalUsed,
                    attemptsLeft: Math.max(0, MAX_ATTEMPTS_PER_QUIZ - finalUsed),
                    unlocked: bypassed || previousCleared,
                    lockedReason:
                        bypassed || previousCleared
                            ? null
                            : 'Completá todos los módulos para rendir el checkpoint final',
                }
                : null,
        };
    }

    /**
     * ¿Puede abrir esta lección? Además del gate de acceso (inscripción, pago,
     * vista previa) que resuelve LessonsAccessService, tiene que haber llegado
     * hasta ese módulo.
     */
    async canOpenLesson(
        actor: ProgressionActor,
        courseId: string,
        moduleId: string | null | undefined,
    ): Promise<boolean> {
        if (!moduleId) return true;

        const progression = await this.getProgression(actor, courseId);
        if (progression.bypassed) return true;

        const gate = progression.modules.find((m) => m.moduleId === moduleId);
        // Un módulo que no está en la progresión (dado de baja) no se bloquea
        // acá: de eso ya se ocupa el gate de contenido.
        return gate ? gate.lessonsUnlocked : true;
    }

    /**
     * Habilita ABRIR un checkpoint, o explica por qué no: sin esto, el que
     * conoce el id del quiz lo abre salteándose las lecciones.
     *
     * Un checkpoint ya aprobado se puede abrir siempre (para repasarlo), aunque
     * no queden intentos. Lo que no se puede es volver a RENDIRLO: eso lo
     * corta `assertCanSubmit`.
     */
    async assertCanOpen(
        actor: ProgressionActor,
        courseId: string,
        quizId: string,
    ): Promise<void> {
        const progression = await this.getProgression(actor, courseId);
        if (progression.bypassed) return;

        const moduleGate = progression.modules.find((m) => m.quizId === quizId);
        if (moduleGate) {
            // Aprobado se abre siempre, para repasarlo. Va ANTES que el resto:
            // si no, desmarcar una lección bloqueaba un checkpoint ya aprobado.
            if (moduleGate.quizPassed) return;

            if (!moduleGate.lessonsUnlocked) {
                throw new ForbiddenException(
                    'Todavía no llegaste a este módulo: terminá el anterior y aprobá su checkpoint',
                );
            }
            if (!moduleGate.lessonsCompleted) {
                const faltan = moduleGate.totalLessons - moduleGate.completedLessons;
                throw new ForbiddenException(
                    `Te ${faltan === 1 ? 'falta 1 lección' : `faltan ${faltan} lecciones`} de este módulo para rendir el checkpoint`,
                );
            }
            this.assertAttemptsLeft(moduleGate.quizPassed, moduleGate.attemptsLeft);
            return;
        }

        const final = progression.finalCheckpoint;
        if (final?.quizId === quizId) {
            if (final.passed) return;

            if (!final.unlocked) {
                throw new ForbiddenException(
                    'Completá todos los módulos del curso para rendir el checkpoint final',
                );
            }
            this.assertAttemptsLeft(final.passed, final.attemptsLeft);
        }
    }

    /**
     * Habilita ENVIAR un intento. Es más estricto que `assertCanOpen`: además
     * de todo lo anterior, rechaza rendir un checkpoint YA APROBADO.
     *
     * Sin esto, el alumno que aprobaba podía volver a entrar, rehacerlo y
     * gastar un intento que no necesitaba — y, si lo erraba, terminaba con el
     * checkpoint aprobado pero sin intentos, o peor, rendido de nuevo sin
     * necesidad. Aprobado es un estado final: no se vuelve a rendir.
     */
    async assertCanSubmit(
        actor: ProgressionActor,
        courseId: string,
        quizId: string,
    ): Promise<void> {
        const progression = await this.getProgression(actor, courseId);
        if (progression.bypassed) return;

        const alreadyPassed =
            progression.modules.some((m) => m.quizId === quizId && m.quizPassed) ||
            (progression.finalCheckpoint?.quizId === quizId &&
                progression.finalCheckpoint.passed);

        if (alreadyPassed) {
            throw new ConflictException('Ya aprobaste este checkpoint: no hace falta rendirlo de nuevo');
        }

        await this.assertCanOpen(actor, courseId, quizId);
    }

    /**
     * Decide si el curso quedó terminado y, si recién ahora lo está, lo marca
     * y avisa con COURSE_COMPLETED.
     *
     * Un curso está terminado cuando están las lecciones AL 100% **y** todos
     * los checkpoints aprobados. Antes el evento salía sólo con las lecciones,
     * y el alumno recibía "¡Completaste el curso! Tu certificado te llega en
     * unos minutos" con el checkpoint final todavía pendiente — un mail que
     * prometía algo que el back después negaba con un 400.
     *
     * `enrollment.completedAt` es el guardia de idempotencia: el evento sale
     * en la transición a terminado y nada más. Si el curso deja de estarlo
     * (una lección desmarcada, o una lección nueva del docente), se limpia y
     * puede volver a emitirse más adelante.
     *
     * Lo llaman los dos lados que pueden completar un curso: registrar
     * progreso de una lección y aprobar un checkpoint.
     */
    async settleCourseCompletion(userId: string, courseId: string): Promise<void> {
        const enrollment = await this.enrollmentsRepository.findOne({
            where: { student: { id: userId }, course: { id: courseId }, isActive: true },
            select: { id: true, progressPercent: true, completedAt: true },
        });
        if (!enrollment) return;

        const quizzes = await this.activeQuizzes(courseId);
        const passed = await this.passedQuizIds(userId, quizzes.map((quiz) => quiz.id));
        const isComplete =
            enrollment.progressPercent >= 100 && quizzes.every((quiz) => passed.has(quiz.id));

        const wasComplete = enrollment.completedAt !== null;
        if (isComplete === wasComplete) return;

        await this.enrollmentsRepository.update(
            { id: enrollment.id },
            { completedAt: isComplete ? new Date() : null },
        );

        if (isComplete) {
            this.eventEmitter.emit(
                EVENTS.COURSE_COMPLETED,
                new CourseCompletedEvent(userId, courseId),
            );
        }
    }

    /**
     * Cuántos intentos le quedan a alguien en un checkpoint puntual.
     *
     * Existe aparte de `getProgression` porque la pantalla del quiz necesita
     * sólo este número y no todo el árbol del curso.
     */
    async attemptsFor(
        userId: string,
        quizId: string,
    ): Promise<{ maxAttempts: number; attemptsLeft: number; passed: boolean }> {
        const [used, passedCount] = await Promise.all([
            this.attemptsRepository.count({ where: { userId, quizId } }),
            this.attemptsRepository.count({ where: { userId, quizId, passed: true } }),
        ]);

        return {
            maxAttempts: MAX_ATTEMPTS_PER_QUIZ,
            attemptsLeft: Math.max(0, MAX_ATTEMPTS_PER_QUIZ - used),
            passed: passedCount > 0,
        };
    }

    /**
     * Ya aprobado, los intentos no importan: se puede volver a entrar a ver el
     * checkpoint. Lo que se corta es seguir rindiendo sin haber aprobado.
     */
    private assertAttemptsLeft(passed: boolean, attemptsLeft: number): void {
        if (passed || attemptsLeft > 0) return;

        throw new ForbiddenException(
            `Agotaste los ${MAX_ATTEMPTS_PER_QUIZ} intentos de este checkpoint. Escribile al docente del curso.`,
        );
    }

    /** ADMIN, o el docente que dicta el curso: no cursan, revisan. */
    private async canBypass(actor: ProgressionActor, courseId: string): Promise<boolean> {
        if (actor.role === UserRole.ADMIN) return true;
        if (actor.role !== UserRole.TEACHER) return false;

        return this.coursesRepository.exists({
            where: { id: courseId, instructor: { id: actor.id } },
        });
    }

    private async completedLessonIds(userId: string, courseId: string): Promise<Set<string>> {
        const enrollment = await this.enrollmentsRepository.findOne({
            where: { student: { id: userId }, course: { id: courseId }, isActive: true },
            select: { id: true },
        });
        if (!enrollment) return new Set();

        const rows = await this.progressRepository.find({
            where: { enrollment: { id: enrollment.id }, completed: true },
            relations: { lesson: true },
            select: { id: true, lesson: { id: true } },
        });
        return new Set(rows.map((row) => row.lesson?.id).filter((id): id is string => !!id));
    }

    /** Vigentes: módulo vivo (o fin de curso) y con al menos una pregunta. */
    private async activeQuizzes(courseId: string): Promise<Quiz[]> {
        const quizzes = await this.quizzesRepository.find({
            where: { courseId },
            relations: { module: true },
        });
        const candidates = quizzes.filter(
            (quiz) => quiz.moduleId === null || quiz.module?.isActive === true,
        );
        if (candidates.length === 0) return [];

        const questions = await this.questionsRepository.find({
            where: { quizId: In(candidates.map((quiz) => quiz.id)) },
            select: { quizId: true },
        });
        const nonEmpty = new Set(questions.map((question) => question.quizId));

        return candidates.filter((quiz) => nonEmpty.has(quiz.id));
    }

    private async passedQuizIds(userId: string, quizIds: string[]): Promise<Set<string>> {
        if (quizIds.length === 0) return new Set();

        const attempts = await this.attemptsRepository.find({
            where: { userId, quizId: In(quizIds), passed: true },
            select: { quizId: true },
        });
        return new Set(attempts.map((attempt) => attempt.quizId));
    }

    private async attemptsByQuiz(userId: string, quizIds: string[]): Promise<Map<string, number>> {
        if (quizIds.length === 0) return new Map();

        const rows = await this.attemptsRepository
            .createQueryBuilder('attempt')
            .select('attempt.quiz_id', 'quizId')
            .addSelect('COUNT(*)', 'total')
            .where('attempt.user_id = :userId', { userId })
            .andWhere('attempt.quiz_id IN (:...quizIds)', { quizIds })
            .groupBy('attempt.quiz_id')
            .getRawMany<{ quizId: string; total: string }>();

        return new Map(rows.map((row) => [row.quizId, Number(row.total)]));
    }
}
