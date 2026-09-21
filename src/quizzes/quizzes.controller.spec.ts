import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';

/**
 * Metadata de las rutas: las de gestión exigen TEACHER (RolesGuard +
 * @Roles). La titularidad del curso la prueba quizzes.service.spec.
 */

const TEACHER_ROUTES = [
    'create',
    'findForTeacher',
    'update',
    'remove',
    'addQuestion',
    'updateQuestion',
    'removeQuestion',
] as const;

const STUDENT_ROUTES = ['findForStudent', 'findCourseCheckpoints', 'submitAttempt'] as const;

describe('QuizzesController', () => {
    const reflector = new Reflector();
    const handler = (name: keyof QuizzesController) => QuizzesController.prototype[name];

    it.each(TEACHER_ROUTES)('%s: sólo TEACHER, con RolesGuard', (name) => {
        expect(reflector.get(ROLES_KEY, handler(name))).toEqual([UserRole.TEACHER]);
        expect(reflector.get(GUARDS_METADATA, handler(name))).toContain(RolesGuard);
    });

    it.each(STUDENT_ROUTES)('%s: sin restricción de rol (alcanza con el JWT)', (name) => {
        expect(reflector.get(ROLES_KEY, handler(name))).toBeUndefined();
    });

    it('delega en el service con el usuario del JWT', async () => {
        const service = {
            submitAttempt: jest.fn(async () => ({ passed: true })),
            create: jest.fn(async () => ({ id: 'quiz-1' })),
        };
        const controller = new QuizzesController(service as unknown as QuizzesService);
        const user = { id: 'teacher-1', role: UserRole.TEACHER };
        const dto = { courseId: 'c1', title: 'x' };

        await controller.create(dto, user);
        await controller.submitAttempt('quiz-1', { answers: [] }, 'student-1');

        expect(service.create).toHaveBeenCalledWith(dto, user);
        expect(service.submitAttempt).toHaveBeenCalledWith('quiz-1', 'student-1', { answers: [] });
    });
});
