import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
    CourseProgressionService,
    MAX_ATTEMPTS_PER_QUIZ,
} from './course-progression.service';
import { UserRole } from '../users/entities/user.entity';

/**
 * Unit de la progresión secuencial. Los repos se mockean con lo justo: acá se
 * prueba la REGLA (qué desbloquea qué), no TypeORM.
 *
 * Curso de ejemplo: 2 módulos de 2 lecciones cada uno, con checkpoint, más un
 * checkpoint de fin de curso.
 */

const COURSE_ID = 'course-1';
const STUDENT = { id: 'student-1', role: UserRole.STUDENT };
const TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };
const ADMIN = { id: 'admin-1', role: UserRole.ADMIN };

const MODULES = [
    { id: 'mod-1', order: 1, title: 'Módulo 1', isActive: true },
    { id: 'mod-2', order: 2, title: 'Módulo 2', isActive: true },
];

const LESSONS = [
    { id: 'l1', module: { id: 'mod-1' } },
    { id: 'l2', module: { id: 'mod-1' } },
    { id: 'l3', module: { id: 'mod-2' } },
    { id: 'l4', module: { id: 'mod-2' } },
];

const QUIZZES = [
    { id: 'quiz-1', courseId: COURSE_ID, moduleId: 'mod-1', module: MODULES[0] },
    { id: 'quiz-2', courseId: COURSE_ID, moduleId: 'mod-2', module: MODULES[1] },
    { id: 'quiz-final', courseId: COURSE_ID, moduleId: null, module: null },
];

interface Options {
    /** Ids de lecciones completadas por el alumno. */
    completed?: string[];
    /** Ids de quizzes aprobados. */
    passed?: string[];
    /** Intentos usados por quiz. */
    attempts?: Record<string, number>;
    quizzes?: typeof QUIZZES;
    modules?: typeof MODULES;
    /** El curso lo dicta TEACHER. */
    isOwner?: boolean;
}

function makeService({
    completed = [],
    passed = [],
    attempts = {},
    quizzes = QUIZZES,
    modules = MODULES,
    isOwner = true,
}: Options = {}) {
    const modulesRepository = { find: jest.fn(async () => modules) };
    const lessonsRepository = {
        find: jest.fn(async () =>
            LESSONS.filter((l) => modules.some((m) => m.id === l.module.id)),
        ),
    };
    const progressRepository = {
        find: jest.fn(async () => completed.map((id) => ({ id: `p-${id}`, lesson: { id } }))),
    };
    const enrollmentsRepository = { findOne: jest.fn(async () => ({ id: 'enr-1' })) };
    const quizzesRepository = { find: jest.fn(async () => quizzes) };
    // Todos los quizzes del fixture tienen preguntas.
    const questionsRepository = {
        find: jest.fn(async () => quizzes.map((q) => ({ quizId: q.id }))),
    };
    const attemptsRepository = {
        count: jest.fn(async () => 0),
        find: jest.fn(async () => passed.map((quizId) => ({ quizId }))),
        createQueryBuilder: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            getRawMany: jest.fn(async () =>
                Object.entries(attempts).map(([quizId, total]) => ({
                    quizId,
                    total: String(total),
                })),
            ),
        })),
    };
    const coursesRepository = { exists: jest.fn(async () => isOwner) };

    const service = new CourseProgressionService(
        modulesRepository as never,
        lessonsRepository as never,
        progressRepository as never,
        enrollmentsRepository as never,
        quizzesRepository as never,
        questionsRepository as never,
        attemptsRepository as never,
        coursesRepository as never,
    );

    return { service, enrollmentsRepository, attemptsRepository };
}

describe('CourseProgressionService — desbloqueo de módulos', () => {
    it('el primer módulo arranca abierto y el segundo cerrado', async () => {
        const { service } = makeService();
        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[0].lessonsUnlocked).toBe(true);
        expect(modules[1].lessonsUnlocked).toBe(false);
        expect(modules[1].lockedReason).toMatch(/módulo anterior/i);
    });

    it('con las lecciones del módulo 1 hechas pero el checkpoint sin aprobar, el módulo 2 sigue cerrado', async () => {
        const { service } = makeService({ completed: ['l1', 'l2'] });
        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[0].lessonsCompleted).toBe(true);
        expect(modules[0].checkpointUnlocked).toBe(true);
        expect(modules[1].lessonsUnlocked).toBe(false);
    });

    it('aprobado el checkpoint del módulo 1, se abre el módulo 2', async () => {
        const { service } = makeService({ completed: ['l1', 'l2'], passed: ['quiz-1'] });
        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[1].lessonsUnlocked).toBe(true);
        // Pero su checkpoint no: todavía no leyó sus lecciones.
        expect(modules[1].checkpointUnlocked).toBe(false);
    });

    /* El botón "Marcar como completada" es un toggle: el alumno puede
       desmarcar una lección para releerla. Eso no puede quitarle el acceso a
       módulos que ya se ganó aprobando el checkpoint. */
    it('desmarcar una lección NO revoca el módulo siguiente ya desbloqueado', async () => {
        const { service } = makeService({
            completed: ['l1'], // desmarcó l2
            passed: ['quiz-1'],
        });
        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[0].lessonsCompleted).toBe(false);
        expect(modules[1].lessonsUnlocked).toBe(true);
    });

    it('un checkpoint aprobado se sigue pudiendo abrir aunque desmarque una lección', async () => {
        const { service } = makeService({ completed: ['l1'], passed: ['quiz-1'] });

        const { modules } = await service.getProgression(STUDENT, COURSE_ID);
        expect(modules[0].checkpointUnlocked).toBe(true);

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-1'),
        ).resolves.toBeUndefined();
    });

    it('un módulo SIN checkpoint se cierra sólo con sus lecciones', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2'],
            quizzes: QUIZZES.filter((q) => q.id !== 'quiz-1'),
        });
        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[0].quizId).toBeNull();
        expect(modules[1].lessonsUnlocked).toBe(true);
    });
});

describe('CourseProgressionService — checkpoint del módulo', () => {
    it('no se habilita hasta terminar TODAS las lecciones del módulo', async () => {
        const { service } = makeService({ completed: ['l1'] });
        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[0].completedLessons).toBe(1);
        expect(modules[0].totalLessons).toBe(2);
        expect(modules[0].checkpointUnlocked).toBe(false);
    });

    it('rendirlo con lecciones pendientes → 403 que dice cuántas faltan', async () => {
        const { service } = makeService({ completed: ['l1'] });

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-1'),
        ).rejects.toThrow(/falta 1 lección/i);
    });

    it('saltar al checkpoint de un módulo al que no llegó → 403', async () => {
        const { service } = makeService();

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-2'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('con todo en orden, deja rendir', async () => {
        const { service } = makeService({ completed: ['l1', 'l2'] });

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-1'),
        ).resolves.toBeUndefined();
    });
});

describe('CourseProgressionService — límite de intentos', () => {
    it(`deja rendir mientras queden intentos (máximo ${MAX_ATTEMPTS_PER_QUIZ})`, async () => {
        const { service } = makeService({
            completed: ['l1', 'l2'],
            attempts: { 'quiz-1': MAX_ATTEMPTS_PER_QUIZ - 1 },
        });

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-1'),
        ).resolves.toBeUndefined();
    });

    it('agotados los intentos sin aprobar → 403', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2'],
            attempts: { 'quiz-1': MAX_ATTEMPTS_PER_QUIZ },
        });

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-1'),
        ).rejects.toThrow(/agotaste/i);
    });

    it('ya aprobado, los intentos agotados no lo bloquean', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2'],
            passed: ['quiz-1'],
            attempts: { 'quiz-1': MAX_ATTEMPTS_PER_QUIZ + 3 },
        });

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-1'),
        ).resolves.toBeUndefined();
    });

    it('informa cuántos intentos quedan', async () => {
        const { service } = makeService({ attempts: { 'quiz-1': 1 } });
        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[0].attemptsUsed).toBe(1);
        expect(modules[0].attemptsLeft).toBe(MAX_ATTEMPTS_PER_QUIZ - 1);
    });
});

/* Abrir y rendir son dos permisos distintos. El checkpoint aprobado se puede
   volver a MIRAR, pero no volver a RENDIR: rendirlo de nuevo gastaba un
   intento sobre algo que ya estaba aprobado. */
describe('CourseProgressionService.assertCanSubmit', () => {
    it('un checkpoint ya aprobado NO se puede volver a rendir', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2'],
            passed: ['quiz-1'],
            attempts: { 'quiz-1': 1 },
        });

        await expect(
            service.assertCanSubmit(STUDENT, COURSE_ID, 'quiz-1'),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('pero sí se puede abrir para repasarlo', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2'],
            passed: ['quiz-1'],
            attempts: { 'quiz-1': 1 },
        });

        await expect(
            service.assertCanOpen(STUDENT, COURSE_ID, 'quiz-1'),
        ).resolves.toBeUndefined();
    });

    it('el checkpoint final aprobado tampoco se vuelve a rendir', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2', 'l3', 'l4'],
            passed: ['quiz-1', 'quiz-2', 'quiz-final'],
        });

        await expect(
            service.assertCanSubmit(STUDENT, COURSE_ID, 'quiz-final'),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('sin aprobar y con intentos, deja enviar', async () => {
        const { service } = makeService({ completed: ['l1', 'l2'] });

        await expect(
            service.assertCanSubmit(STUDENT, COURSE_ID, 'quiz-1'),
        ).resolves.toBeUndefined();
    });

    it('sin aprobar y sin intentos, no deja enviar', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2'],
            attempts: { 'quiz-1': MAX_ATTEMPTS_PER_QUIZ },
        });

        await expect(
            service.assertCanSubmit(STUDENT, COURSE_ID, 'quiz-1'),
        ).rejects.toThrow(/agotaste/i);
    });
});

describe('CourseProgressionService.attemptsFor', () => {
    it('cuenta intentos usados y si ya aprobó', async () => {
        const { service, attemptsRepository } = makeService();
        attemptsRepository.count
            .mockResolvedValueOnce(1 as never) // usados
            .mockResolvedValueOnce(1 as never); // aprobados

        await expect(service.attemptsFor(STUDENT.id, 'quiz-1')).resolves.toEqual({
            maxAttempts: MAX_ATTEMPTS_PER_QUIZ,
            attemptsLeft: MAX_ATTEMPTS_PER_QUIZ - 1,
            passed: true,
        });
    });

    it('nunca devuelve intentos negativos', async () => {
        const { service, attemptsRepository } = makeService();
        attemptsRepository.count
            .mockResolvedValueOnce((MAX_ATTEMPTS_PER_QUIZ + 5) as never)
            .mockResolvedValueOnce(0 as never);

        const result = await service.attemptsFor(STUDENT.id, 'quiz-1');
        expect(result.attemptsLeft).toBe(0);
        expect(result.passed).toBe(false);
    });
});

describe('CourseProgressionService — checkpoint final', () => {
    it('cerrado mientras quede un módulo sin completar', async () => {
        const { service } = makeService({ completed: ['l1', 'l2'], passed: ['quiz-1'] });
        const { finalCheckpoint } = await service.getProgression(STUDENT, COURSE_ID);

        expect(finalCheckpoint?.unlocked).toBe(false);
    });

    it('se abre con todos los módulos cerrados', async () => {
        const { service } = makeService({
            completed: ['l1', 'l2', 'l3', 'l4'],
            passed: ['quiz-1', 'quiz-2'],
        });
        const { finalCheckpoint } = await service.getProgression(STUDENT, COURSE_ID);

        expect(finalCheckpoint?.unlocked).toBe(true);
    });

    it('un curso sin checkpoint final devuelve null', async () => {
        const { service } = makeService({
            quizzes: QUIZZES.filter((q) => q.moduleId !== null),
        });
        const { finalCheckpoint } = await service.getProgression(STUDENT, COURSE_ID);

        expect(finalCheckpoint).toBeNull();
    });
});

describe('CourseProgressionService — quién no cursa', () => {
    it('el ADMIN ve todo desbloqueado', async () => {
        const { service } = makeService();
        const progression = await service.getProgression(ADMIN, COURSE_ID);

        expect(progression.bypassed).toBe(true);
        expect(progression.modules.every((m) => m.lessonsUnlocked)).toBe(true);
    });

    it('el docente que dicta el curso también', async () => {
        const { service } = makeService({ isOwner: true });
        const progression = await service.getProgression(TEACHER, COURSE_ID);

        expect(progression.bypassed).toBe(true);
        await expect(
            service.assertCanOpen(TEACHER, COURSE_ID, 'quiz-2'),
        ).resolves.toBeUndefined();
    });

    it('un docente AJENO cursa como cualquier alumno', async () => {
        const { service } = makeService({ isOwner: false });
        const progression = await service.getProgression(TEACHER, COURSE_ID);

        expect(progression.bypassed).toBe(false);
        expect(progression.modules[1].lessonsUnlocked).toBe(false);
    });

    it('sin inscripción no hay lecciones completadas: todo cerrado salvo el módulo 1', async () => {
        const { service, enrollmentsRepository } = makeService({ completed: ['l1', 'l2'] });
        enrollmentsRepository.findOne.mockResolvedValueOnce(null as never);

        const { modules } = await service.getProgression(STUDENT, COURSE_ID);

        expect(modules[0].completedLessons).toBe(0);
        expect(modules[1].lessonsUnlocked).toBe(false);
    });
});

describe('CourseProgressionService.canOpenLesson', () => {
    it('deja abrir una lección del módulo desbloqueado', async () => {
        const { service } = makeService();
        await expect(service.canOpenLesson(STUDENT, COURSE_ID, 'mod-1')).resolves.toBe(true);
    });

    it('bloquea una del módulo que todavía no se abrió', async () => {
        const { service } = makeService();
        await expect(service.canOpenLesson(STUDENT, COURSE_ID, 'mod-2')).resolves.toBe(false);
    });

    it('una lección sin módulo no se bloquea acá', async () => {
        const { service } = makeService();
        await expect(service.canOpenLesson(STUDENT, COURSE_ID, null)).resolves.toBe(true);
    });
});
