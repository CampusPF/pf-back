import { Injectable } from '@nestjs/common';
import { LessonsAccessService, AccessActor } from '../lessons/lessons-access.service';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UserRole } from '../users/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { ForumThread } from './entities/forum-thread.entity';

/**
 * Reglas de quién puede leer, escribir y moderar en el foro. Vive en el
 * service (no en un guard) porque depende del curso y del hilo concretos.
 *
 * - Foro de curso: la misma regla que el contenido de las lecciones (admin,
 *   docente dueño, inscripto o con suscripción). Curso desactivado = nadie.
 * - Foro general: admin/docente siempre; un alumno necesita suscripción
 *   activa o estar inscripto (haber comprado/cursado) en al menos un curso.
 *   No es un foro de bienvenida para cuentas recién creadas sin ningún
 *   vínculo con el campus.
 * - Moderar: admin, o el docente dueño del curso (sólo en foros de curso).
 */
@Injectable()
export class ForumAccessService {
    constructor(
        private readonly lessonsAccess: LessonsAccessService,
        private readonly enrollments: CourseEnrollmentsService,
        private readonly subscriptions: SubscriptionsService,
    ) { }

    /** Puede participar del foro de este curso (leer y responder). */
    canUseCourseForum(user: AccessActor, course: Course | null | undefined): Promise<boolean> {
        if (!course?.isActive) return Promise.resolve(false);
        return this.lessonsAccess.canAccessCourseContent(user, course);
    }

    /** Puede participar del foro general (categorías, no ligadas a un curso). */
    async canUseGeneralForum(user: AccessActor): Promise<boolean> {
        if (user.role === UserRole.ADMIN || user.role === UserRole.TEACHER) return true;
        if (await this.subscriptions.hasActiveSubscription(user.id)) return true;
        return this.enrollments.hasAnyActiveEnrollment(user.id);
    }

    /** Requiere `thread.course` cargado con `instructor`. */
    canModerate(user: AccessActor, thread: ForumThread): boolean {
        if (user.role === UserRole.ADMIN) return true;
        return !!thread.course?.instructor && thread.course.instructor.id === user.id;
    }

    /** Requiere `thread.course` cargado con `instructor` si es de curso. */
    canRead(user: AccessActor, thread: ForumThread): Promise<boolean> {
        if (thread.courseId) return this.canUseCourseForum(user, thread.course);
        return this.canUseGeneralForum(user);
    }
}
