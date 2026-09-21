import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { UserRole } from '../users/entities/user.entity';
import { EVENTS } from '../events';

/**
 * Unit del service de checkpoints. Los repositorios se mockean con lo mínimo
 * que usa cada método: acá se prueban las REGLAS (qué se filtra, quién puede
 * editar, cómo se corrige), no TypeORM.
 */

const TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };
const OTHER_TEACHER = { id: 'teacher-2', role: UserRole.TEACHER };
const ADMIN = { id: 'admin-1', role: UserRole.ADMIN };
const STUDENT = { id: 'student-1', role: UserRole.STUDENT };

const COURSE = { id: 'course-1', instructor: { id: TEACHER.id } };

const QUIZ = {
    id: 'quiz-1',
    courseId: COURSE.id,
    moduleId: 'module-1',
    module: { id: 'module-1', order: 2, isActive: true },
    course: COURSE,
    title: 'Checkpoint del módulo 2',
    passingScore: 70,
};

// Desordenadas a propósito: el service pide order ASC al repo.
const QUESTIONS = [
    { id: 'q1', quizId: QUIZ.id, text: '¿Pregunta 1?', order: 1 },
    { id: 'q2', quizId: QUIZ.id, text: '¿Pregunta 2?', order: 2 },
    { id: 'q3', quizId: QUIZ.id, text: '¿Pregunta 3?', order: 3 },
];

const OPTIONS = [
    { id: 'q1-a', questionId: 'q1', text: 'A1', isCorrect: true },
    { id: 'q1-b', questionId: 'q1', text: 'B1', isCorrect: false },
    { id: 'q2-a', questionId: 'q2', text: 'A2', isCorrect: false },
    { id: 'q2-b', questionId: 'q2', text: 'B2', isCorrect: true },
    { id: 'q3-a', questionId: 'q3', text: 'A3', isCorrect: true },
    { id: 'q3-b', questionId: 'q3', text: 'B3', isCorrect: false },
];

const VALID_OPTIONS = [
    { text: 'Sí', isCorrect: true },
    { text: 'No', isCorrect: false },
];

function makeService() {
    const quizzesRepository = {
        findOne: jest.fn(async () => QUIZ),
        find: jest.fn(async () => [QUIZ]),
        exists: jest.fn(async () => false),
        update: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
    };
    const questionsRepository = {
        find: jest.fn(async () => QUESTIONS),
        findOne: jest.fn(async () => QUESTIONS[2]),
        delete: jest.fn(async () => undefined),
    };
    const optionsRepository = { find: jest.fn(async () => OPTIONS) };
    const attemptsRepository = {
        find: jest.fn(async () => [] as { quizId: string }[]),
        create: jest.fn((data) => data),
        save: jest.fn(async (data) => data),
    };
    const coursesRepository = { findOne: jest.fn(async () => COURSE) };
    const courseModulesRepository = { findOne: jest.fn(async () => QUIZ.module) };
    const enrollmentsRepository = { exists: jest.fn(async () => true) };

    const manager = {
        save: jest.fn(async (_entity, data) =>
            Array.isArray(data) ? data : { id: 'new-id', ...data },
        ),
        update: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
    };
    const dataSource = { transaction: jest.fn(async (cb) => cb(manager)) };
    const eventEmitter = { emit: jest.fn() };
    /* La progresión tiene sus propios tests: acá sólo interesa que el service
       la consulte. Por defecto deja pasar; un test la hace tirar para
       comprobar que el error sube tal cual. */
    const progression = {
        assertCanOpen: jest.fn(async () => undefined),
        assertCanSubmit: jest.fn(async () => undefined),
        attemptsFor: jest.fn(async () => ({ maxAttempts: 2, attemptsLeft: 2, passed: false })),
    };

    const service = new QuizzesService(
        quizzesRepository as never,
        questionsRepository as never,
        optionsRepository as never,
        attemptsRepository as never,
        coursesRepository as never,
        courseModulesRepository as never,
        enrollmentsRepository as never,
        dataSource as never,
        eventEmitter as never,
        progression as never,
    );

    return {
        service,
        quizzesRepository,
        questionsRepository,
        attemptsRepository,
        courseModulesRepository,
        enrollmentsRepository,
        manager,
        dataSource,
        eventEmitter,
        progression,
    };
}

/** Recorre el objeto entero buscando una clave, a cualquier profundidad. */
function hasKeyDeep(value: unknown, key: string): boolean {
    if (Array.isArray(value)) return value.some((item) => hasKeyDeep(item, key));
    if (value && typeof value === 'object') {
        return Object.entries(value).some(([k, v]) => k === key || hasKeyDeep(v, key));
    }
    return false;
}

describe('QuizzesService.findForStudent', () => {
    it('NUNCA devuelve isCorrect', async () => {
        const { service } = makeService();
        const quiz = await service.findForStudent(QUIZ.id, STUDENT);

        expect(hasKeyDeep(quiz, 'isCorrect')).toBe(false);
        expect(JSON.stringify(quiz)).not.toContain('isCorrect');
    });

    it('respeta el contrato del front', async () => {
        const { service } = makeService();
        const quiz = await service.findForStudent(QUIZ.id, STUDENT);

        expect(quiz).toEqual({
            id: QUIZ.id,
            courseId: COURSE.id,
            moduleId: 'module-1',
            moduleOrder: 2,
            title: QUIZ.title,
            passingScore: 70,
            maxAttempts: 2,
            attemptsLeft: 2,
            passed: false,
            canAttempt: true,
            questions: [
                { id: 'q1', text: '¿Pregunta 1?', options: [{ id: 'q1-a', text: 'A1' }, { id: 'q1-b', text: 'B1' }] },
                { id: 'q2', text: '¿Pregunta 2?', options: [{ id: 'q2-a', text: 'A2' }, { id: 'q2-b', text: 'B2' }] },
                { id: 'q3', text: '¿Pregunta 3?', options: [{ id: 'q3-a', text: 'A3' }, { id: 'q3-b', text: 'B3' }] },
            ],
        });
    });

    it('pide las preguntas ordenadas por order_index', async () => {
        const { service, questionsRepository } = makeService();
        await service.findForStudent(QUIZ.id, STUDENT);

        expect(questionsRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({ order: { order: 'ASC' } }),
        );
    });

    it('alumno no inscripto → 404', async () => {
        const { service, enrollmentsRepository } = makeService();
        enrollmentsRepository.exists.mockResolvedValueOnce(false);

        await expect(service.findForStudent(QUIZ.id, STUDENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('quiz inexistente → 404', async () => {
        const { service, quizzesRepository } = makeService();
        quizzesRepository.findOne.mockResolvedValueOnce(null as never);

        await expect(service.findForStudent('nope', STUDENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('quiz de un módulo dado de baja → 404', async () => {
        const { service, quizzesRepository } = makeService();
        quizzesRepository.findOne.mockResolvedValueOnce({
            ...QUIZ,
            module: { ...QUIZ.module, isActive: false },
        });

        await expect(service.findForStudent(QUIZ.id, STUDENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el docente dueño lo ve sin estar inscripto (vista previa)', async () => {
        const { service, enrollmentsRepository } = makeService();
        enrollmentsRepository.exists.mockResolvedValue(false);

        await expect(service.findForStudent(QUIZ.id, TEACHER)).resolves.toMatchObject({ id: QUIZ.id });
    });
});

describe('QuizzesService.submitAttempt', () => {
    const ALL_CORRECT = [
        { questionId: 'q1', optionId: 'q1-a' },
        { questionId: 'q2', optionId: 'q2-b' },
        { questionId: 'q3', optionId: 'q3-a' },
    ];

    it('optionId de otro quiz → 400 y no guarda el intento', async () => {
        const { service, attemptsRepository } = makeService();

        await expect(
            service.submitAttempt(QUIZ.id, STUDENT, {
                answers: [{ questionId: 'q1', optionId: 'option-de-otro-quiz' }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(attemptsRepository.save).not.toHaveBeenCalled();
    });

    it('optionId de OTRA pregunta del mismo quiz → 400', async () => {
        const { service } = makeService();

        await expect(
            service.submitAttempt(QUIZ.id, STUDENT, {
                answers: [{ questionId: 'q1', optionId: 'q2-b' }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('questionId que no es de este quiz → 400', async () => {
        const { service } = makeService();

        await expect(
            service.submitAttempt(QUIZ.id, STUDENT, {
                answers: [{ questionId: 'otra-pregunta', optionId: 'q1-a' }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('la misma pregunta respondida dos veces → 400', async () => {
        const { service } = makeService();

        await expect(
            service.submitAttempt(QUIZ.id, STUDENT, {
                answers: [
                    { questionId: 'q1', optionId: 'q1-a' },
                    { questionId: 'q1', optionId: 'q1-b' },
                ],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no inscripto → 404', async () => {
        const { service, enrollmentsRepository } = makeService();
        enrollmentsRepository.exists.mockResolvedValueOnce(false);

        await expect(
            service.submitAttempt(QUIZ.id, STUDENT, { answers: ALL_CORRECT }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('todo bien → aprueba, revela la correcta, guarda y emite QUIZ_PASSED', async () => {
        const { service, attemptsRepository, eventEmitter } = makeService();

        const result = await service.submitAttempt(QUIZ.id, STUDENT, { answers: ALL_CORRECT });

        expect(result).toMatchObject({
            score: 100,
            passed: true,
            passingScore: 70,
            correctCount: 3,
            totalQuestions: 3,
        });
        expect(result.details[0]).toEqual({
            questionId: 'q1',
            questionText: '¿Pregunta 1?',
            correct: true,
            selectedOptionText: 'A1',
            correctOptionText: 'A1',
        });
        expect(attemptsRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ userId: STUDENT.id, quizId: QUIZ.id, score: 100, passed: true }),
        );
        expect(eventEmitter.emit).toHaveBeenCalledWith(
            EVENTS.QUIZ_PASSED,
            expect.objectContaining({ userId: STUDENT.id, quizId: QUIZ.id, courseId: COURSE.id, score: 100 }),
        );
    });

    it('desaprueba → score redondeado, "Sin responder", sin correctOptionText y sin evento', async () => {
        const { service, attemptsRepository, eventEmitter } = makeService();

        // q1 bien, q2 mal, q3 sin responder: 1 de 3 = 33.
        const result = await service.submitAttempt(QUIZ.id, STUDENT, {
            answers: [
                { questionId: 'q1', optionId: 'q1-a' },
                { questionId: 'q2', optionId: 'q2-a' },
            ],
        });

        expect(result.score).toBe(33);
        expect(result.passed).toBe(false);
        expect(result.correctCount).toBe(1);
        expect(result.details[2]).toEqual({
            questionId: 'q3',
            questionText: '¿Pregunta 3?',
            correct: false,
            selectedOptionText: 'Sin responder',
        });
        expect(hasKeyDeep(result, 'correctOptionText')).toBe(false);
        expect(attemptsRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ score: 33, passed: false }),
        );
        expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('redondea el score (2 de 3 → 67)', async () => {
        const { service } = makeService();
        const result = await service.submitAttempt(QUIZ.id, STUDENT, {
            answers: ALL_CORRECT.slice(0, 2),
        });
        expect(result.score).toBe(67);
    });
});

describe('QuizzesService.hasPassedAllQuizzes', () => {
    it('curso sin quizzes → true', async () => {
        const { service, quizzesRepository } = makeService();
        quizzesRepository.find.mockResolvedValueOnce([]);

        await expect(service.hasPassedAllQuizzes(STUDENT.id, COURSE.id)).resolves.toBe(true);
    });

    it('falta aprobar uno → false', async () => {
        const { service, quizzesRepository, questionsRepository, attemptsRepository } = makeService();
        const finalQuiz = { ...QUIZ, id: 'quiz-final', moduleId: null, module: null };
        quizzesRepository.find.mockResolvedValueOnce([QUIZ, finalQuiz]);
        questionsRepository.find.mockResolvedValueOnce([
            { quizId: QUIZ.id },
            { quizId: 'quiz-final' },
        ] as never);
        attemptsRepository.find.mockResolvedValueOnce([{ quizId: QUIZ.id }]);

        await expect(service.hasPassedAllQuizzes(STUDENT.id, COURSE.id)).resolves.toBe(false);
    });

    it('todos aprobados (módulo + fin de curso) → true', async () => {
        const { service, quizzesRepository, questionsRepository, attemptsRepository } = makeService();
        const finalQuiz = { ...QUIZ, id: 'quiz-final', moduleId: null, module: null };
        quizzesRepository.find.mockResolvedValueOnce([QUIZ, finalQuiz]);
        questionsRepository.find.mockResolvedValueOnce([
            { quizId: QUIZ.id },
            { quizId: 'quiz-final' },
        ] as never);
        attemptsRepository.find.mockResolvedValueOnce([{ quizId: QUIZ.id }, { quizId: 'quiz-final' }]);

        await expect(service.hasPassedAllQuizzes(STUDENT.id, COURSE.id)).resolves.toBe(true);
    });

    it('un quiz sin preguntas no bloquea', async () => {
        const { service, quizzesRepository, questionsRepository } = makeService();
        quizzesRepository.find.mockResolvedValueOnce([QUIZ]);
        questionsRepository.find.mockResolvedValueOnce([]);

        await expect(service.hasPassedAllQuizzes(STUDENT.id, COURSE.id)).resolves.toBe(true);
    });
});

describe('QuizzesService.findCourseCheckpoints', () => {
    it('curso sin quizzes → []', async () => {
        const { service, quizzesRepository } = makeService();
        quizzesRepository.find.mockResolvedValueOnce([]);

        await expect(service.findCourseCheckpoints(COURSE.id, STUDENT.id)).resolves.toEqual([]);
    });

    it('marca passed por usuario y deja el de fin de curso al final', async () => {
        const { service, quizzesRepository, questionsRepository, attemptsRepository } = makeService();
        const finalQuiz = { ...QUIZ, id: 'quiz-final', moduleId: null, module: null };
        quizzesRepository.find.mockResolvedValueOnce([finalQuiz, QUIZ]);
        questionsRepository.find.mockResolvedValueOnce([
            { quizId: QUIZ.id },
            { quizId: 'quiz-final' },
        ] as never);
        attemptsRepository.find.mockResolvedValueOnce([{ quizId: QUIZ.id }]);

        await expect(service.findCourseCheckpoints(COURSE.id, STUDENT.id)).resolves.toEqual([
            {
                quizId: QUIZ.id,
                moduleId: 'module-1',
                moduleOrder: 2,
                title: QUIZ.title,
                passed: true,
            },
            {
                quizId: 'quiz-final',
                moduleId: null,
                moduleOrder: null,
                title: finalQuiz.title,
                passed: false,
            },
        ]);
        expect(attemptsRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ userId: STUDENT.id, passed: true }),
            }),
        );
    });
});

describe('QuizzesService — gestión del docente', () => {
    const CREATE_DTO = {
        courseId: COURSE.id,
        moduleId: 'module-1',
        title: 'Checkpoint',
        passingScore: 70,
        questions: [{ text: '¿?', options: VALID_OPTIONS }],
    };

    it('create: el docente dueño crea quiz + preguntas + opciones en una transacción', async () => {
        const { service, manager, dataSource } = makeService();

        const result = await service.create(CREATE_DTO, TEACHER);

        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(manager.save).toHaveBeenCalledTimes(3); // quiz, pregunta, opciones
        expect(result).toMatchObject({ courseId: COURSE.id, moduleId: 'module-1', moduleOrder: 2 });
        // El docente sí ve isCorrect.
        expect(hasKeyDeep(result, 'isCorrect')).toBe(true);
    });

    it('create: TEACHER que no es dueño → 403', async () => {
        const { service, dataSource } = makeService();

        await expect(service.create(CREATE_DTO, OTHER_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
        expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('create: ADMIN → 403 (no edita contenido)', async () => {
        const { service } = makeService();
        await expect(service.create(CREATE_DTO, ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('create: el módulo ya tiene quiz → 409', async () => {
        const { service, quizzesRepository } = makeService();
        quizzesRepository.exists.mockResolvedValueOnce(true);

        await expect(service.create(CREATE_DTO, TEACHER)).rejects.toBeInstanceOf(ConflictException);
    });

    it('create: el módulo no es del curso → 400', async () => {
        const { service, courseModulesRepository } = makeService();
        courseModulesRepository.findOne.mockResolvedValueOnce(null as never);

        await expect(service.create(CREATE_DTO, TEACHER)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('create: fin de curso valida unicidad con moduleId IS NULL', async () => {
        const { service, quizzesRepository, courseModulesRepository } = makeService();

        await service.create({ ...CREATE_DTO, moduleId: null }, TEACHER);

        expect(courseModulesRepository.findOne).not.toHaveBeenCalled();
        const where = (quizzesRepository.exists.mock.calls[0] as unknown as [{ where: { moduleId: unknown } }])[0].where;
        expect(where.moduleId).toMatchObject({ _type: 'isNull' });
    });

    it.each([
        ['una sola opción', [{ text: 'Sí', isCorrect: true }]],
        ['ninguna correcta', [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }]],
        ['dos correctas', [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }]],
    ])('create: pregunta con %s → 400', async (_label, options) => {
        const { service } = makeService();

        await expect(
            service.create({ ...CREATE_DTO, questions: [{ text: '¿?', options }] }, TEACHER),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('update / remove / addQuestion / updateQuestion / removeQuestion: otro TEACHER → 403', async () => {
        const { service, quizzesRepository, questionsRepository, dataSource } = makeService();

        await expect(service.update(QUIZ.id, { title: 'x' }, OTHER_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.remove(QUIZ.id, OTHER_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.addQuestion(QUIZ.id, { text: '¿?', options: VALID_OPTIONS }, OTHER_TEACHER),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.updateQuestion(QUIZ.id, 'q3', { text: 'x' }, OTHER_TEACHER),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.removeQuestion(QUIZ.id, 'q3', OTHER_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);

        expect(quizzesRepository.update).not.toHaveBeenCalled();
        expect(quizzesRepository.delete).not.toHaveBeenCalled();
        expect(questionsRepository.delete).not.toHaveBeenCalled();
        expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('remove: ADMIN → 403', async () => {
        const { service, quizzesRepository } = makeService();
        await expect(service.remove(QUIZ.id, ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
        expect(quizzesRepository.delete).not.toHaveBeenCalled();
    });

    it('remove: el dueño borra', async () => {
        const { service, quizzesRepository } = makeService();
        await service.remove(QUIZ.id, TEACHER);
        expect(quizzesRepository.delete).toHaveBeenCalledWith(QUIZ.id);
    });

    it('update: el dueño cambia passingScore', async () => {
        const { service, quizzesRepository } = makeService();
        const result = await service.update(QUIZ.id, { passingScore: 80 }, TEACHER);

        expect(quizzesRepository.update).toHaveBeenCalledWith(QUIZ.id, { passingScore: 80 });
        expect(result.passingScore).toBe(80);
    });

    it('addQuestion: sin order → va al final', async () => {
        const { service, manager } = makeService();
        await service.addQuestion(QUIZ.id, { text: '¿Nueva?', options: VALID_OPTIONS }, TEACHER);

        expect(manager.save).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ quizId: QUIZ.id, text: '¿Nueva?', order: 4 }),
        );
    });

    it('updateQuestion: con options reemplaza el set completo', async () => {
        const { service, manager } = makeService();
        await service.updateQuestion(QUIZ.id, 'q3', { options: VALID_OPTIONS }, TEACHER);

        expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { questionId: 'q3' });
        expect(manager.save).toHaveBeenCalledWith(expect.anything(), [
            { questionId: 'q3', text: 'Sí', isCorrect: true },
            { questionId: 'q3', text: 'No', isCorrect: false },
        ]);
    });

    it('updateQuestion: pregunta de otro quiz → 404', async () => {
        const { service, questionsRepository } = makeService();
        questionsRepository.findOne.mockResolvedValueOnce(null as never);

        await expect(
            service.updateQuestion(QUIZ.id, 'q-ajena', { text: 'x' }, TEACHER),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
