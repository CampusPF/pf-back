import { Injectable } from '@nestjs/common';
import { LessonsAccessService, AccessActor } from '../lessons/lessons-access.service';
import { UserRole } from '../users/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { ForumThread } from './entities/forum-thread.entity';

/**
 * Reglas de quién puede leer, escribir y moderar en el foro. Vive en el
 * service (no en un guard) porque depende del curso y del hilo concretos.
 *
 * - Foro de curso: la misma regla que el contenido de las lecciones (admin,
 *   docente dueño, inscripto o con suscripción). Curso desactivado = nadie.
 * - Foro general: cualquier usuario autenticado.
 * - Moderar: admin, o el docente dueño del curso (sólo en foros de curso).
 */
@Injectable()
export class ForumAccessService {
    constructor(private readonly lessonsAccess: LessonsAccessService) { }

    /** Puede participar del foro de este curso (leer y responder). */
    canUseCourseForum(user: AccessActor, course: Course | null | undefined): Promise<boolean> {
        if (!course?.isActive) return Promise.resolve(false);
        return this.lessonsAccess.canAccessCourseContent(user, course);
    }

    /** Requiere `thread.course` cargado con `instructor`. */
    canModerate(user: AccessActor, thread: ForumThread): boolean {
        if (user.role === UserRole.ADMIN) return true;
        return !!thread.course?.instructor && thread.course.instructor.id === user.id;
    }

    /** Requiere `thread.course` cargado con `instructor` si es de curso. */
    canRead(user: AccessActor, thread: ForumThread): Promise<boolean> {
        if (thread.courseId) return this.canUseCourseForum(user, thread.course);
        return Promise.resolve(true);
    }
}
