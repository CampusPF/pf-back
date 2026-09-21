import { NotFoundException } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { LessonsAccessService } from './lessons-access.service';
import { CourseProgressionService } from '../course-progression/course-progression.service';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { UserRole } from '../users/entities/user.entity';

/**
 * Foco: GET /lessons/:id nunca devuelve el contenido real si el usuario no
 * tiene acceso, pero sí el resto (título, orden, módulo) para poder mostrar un
 * CTA de compra. La regla de acceso en sí se testea en
 * lessons-access.service.spec.ts.
 */

function lessonFixture(priceInCents: number) {
    return {
        id: 'lesson-1',
        title: 'Intro',
        order: 1,
        isActive: true,
        content: 'contenido real premium',
        videoUrl: 'https://videos/premium.mp4',
        module: {
            id: 'mod-1',
            title: 'Módulo 1',
            course: { id: 'course-1', priceInCents },
        },
    };
}

/**
 * El controller le pasa al gate el usuario entero, no sólo el id: el gate
 * necesita el rol para dejar pasar al ADMIN.
 */
const STUDENT = { id: 'user-1', role: UserRole.STUDENT };

function makeController(canAccess: boolean, unlocked = true) {
    const findOne = jest.fn();
    const canAccessCourseContent = jest.fn(async () => canAccess);
    // Segundo gate, independiente: la progresión secuencial del curso.
    const canOpenLesson = jest.fn(async () => unlocked);
    const touchAccess = jest.fn(async () => undefined);

    const controller = new LessonsController(
        { findOne } as unknown as LessonsService,
        { canAccessCourseContent } as unknown as LessonsAccessService,
        { canOpenLesson } as unknown as CourseProgressionService,
        { touchAccess } as unknown as CourseEnrollmentsService,
    );

    return { controller, findOne, canAccessCourseContent, canOpenLesson, touchAccess };
}

describe('LessonsController.findOne (gate de contenido)', () => {
    it('con acceso → hasAccess:true y content/videoUrl reales', async () => {
        const { controller, findOne } = makeController(true);
        findOne.mockResolvedValueOnce(lessonFixture(4999));

        const res = await controller.findOne('lesson-1', STUDENT);

        expect(res.hasAccess).toBe(true);
        expect(res.content).toBe('contenido real premium');
        expect(res.videoUrl).toBe('https://videos/premium.mp4');
        expect(res.title).toBe('Intro');
    });

    it('sin acceso → hasAccess:false, content/videoUrl null, resto intacto', async () => {
        const { controller, findOne } = makeController(false);
        findOne.mockResolvedValueOnce(lessonFixture(4999));

        const res = await controller.findOne('lesson-1', STUDENT);

        expect(res.hasAccess).toBe(false);
        expect(res.content).toBeNull();
        expect(res.videoUrl).toBeNull();
        // lo demás sigue estando para el CTA de compra
        expect(res.title).toBe('Intro');
        expect(res.order).toBe(1);
        expect(res.module).toEqual(
            expect.objectContaining({ course: { id: 'course-1', priceInCents: 4999 } }),
        );
    });

    it('resuelve el acceso con el curso del módulo de la lección', async () => {
        const { controller, findOne, canAccessCourseContent } = makeController(true);
        findOne.mockResolvedValueOnce(lessonFixture(0));

        const user = { id: 'user-9', role: UserRole.STUDENT };
        await controller.findOne('lesson-1', user);

        // Con la lección como tercer argumento: `isFree` decide la vista previa.
        expect(canAccessCourseContent).toHaveBeenCalledWith(
            user,
            { id: 'course-1', priceInCents: 0 },
            expect.objectContaining({ id: 'lesson-1' }),
        );
    });

    it('alumno con acceso → registra el acceso al curso (recordatorio de inactividad)', async () => {
        const { controller, findOne, touchAccess } = makeController(true);
        findOne.mockResolvedValueOnce(lessonFixture(0));

        await controller.findOne('lesson-1', STUDENT);

        expect(touchAccess).toHaveBeenCalledWith('user-1', 'course-1');
    });

    it('sin acceso, o si no es alumno → no registra acceso', async () => {
        const denied = makeController(false);
        denied.findOne.mockResolvedValueOnce(lessonFixture(4999));
        await denied.controller.findOne('lesson-1', STUDENT);
        expect(denied.touchAccess).not.toHaveBeenCalled();

        const admin = makeController(true);
        admin.findOne.mockResolvedValueOnce(lessonFixture(0));
        await admin.controller.findOne('lesson-1', { id: 'adm', role: UserRole.ADMIN });
        expect(admin.touchAccess).not.toHaveBeenCalled();
    });

    it('propaga el 404 de la lección inexistente', async () => {
        const { controller, findOne } = makeController(true);
        findOne.mockRejectedValueOnce(new NotFoundException());

        await expect(controller.findOne('nope', STUDENT)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    /* La progresión es un gate SEPARADO del de acceso: el alumno pagó y está
       inscripto, pero todavía no llegó a este módulo. */
    it('módulo bloqueado por progresión → sin contenido, pero hasAccess sigue en true', async () => {
        const { controller, findOne } = makeController(true, false);
        findOne.mockResolvedValueOnce(lessonFixture(4999));

        const res = await controller.findOne('lesson-1', STUDENT);

        expect(res.hasAccess).toBe(true);
        expect(res.isLockedByProgression).toBe(true);
        expect(res.content).toBeNull();
        expect(res.videoUrl).toBeNull();
        expect(res.title).toBe('Intro');
    });

    it('sin acceso no se consulta la progresión: ya está bloqueada por otra razón', async () => {
        const { controller, findOne, canOpenLesson } = makeController(false);
        findOne.mockResolvedValueOnce(lessonFixture(4999));

        const res = await controller.findOne('lesson-1', STUDENT);

        expect(canOpenLesson).not.toHaveBeenCalled();
        expect(res.isLockedByProgression).toBe(false);
    });

    /* Los dos gates conviven: abrir una lección que todavía no le toca no
       muestra contenido, pero SIGUE siendo actividad en el curso — que es lo
       único que le importa al recordatorio de inactividad. */
    it('módulo bloqueado → sin contenido, pero el acceso al curso igual se registra', async () => {
        const { controller, findOne, touchAccess } = makeController(true, false);
        findOne.mockResolvedValueOnce(lessonFixture(0));

        const res = await controller.findOne('lesson-1', STUDENT);

        expect(res.isLockedByProgression).toBe(true);
        expect(res.content).toBeNull();
        expect(touchAccess).toHaveBeenCalledWith('user-1', 'course-1');
    });

    it('con acceso y módulo abierto → isLockedByProgression:false', async () => {
        const { controller, findOne } = makeController(true, true);
        findOne.mockResolvedValueOnce(lessonFixture(0));

        const res = await controller.findOne('lesson-1', STUDENT);

        expect(res.isLockedByProgression).toBe(false);
        expect(res.content).toBe('contenido real premium');
    });
});
