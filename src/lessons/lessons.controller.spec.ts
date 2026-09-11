import { NotFoundException } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { LessonsAccessService } from './lessons-access.service';
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

function makeController(canAccess: boolean) {
    const findOne = jest.fn();
    const canAccessCourseContent = jest.fn(async () => canAccess);

    const controller = new LessonsController(
        { findOne } as unknown as LessonsService,
        { canAccessCourseContent } as unknown as LessonsAccessService,
    );

    return { controller, findOne, canAccessCourseContent };
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

        expect(canAccessCourseContent).toHaveBeenCalledWith(user, {
            id: 'course-1',
            priceInCents: 0,
        });
    });

    it('propaga el 404 de la lección inexistente', async () => {
        const { controller, findOne } = makeController(true);
        findOne.mockRejectedValueOnce(new NotFoundException());

        await expect(controller.findOne('nope', STUDENT)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
