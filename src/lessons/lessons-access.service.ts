import { Injectable } from '@nestjs/common';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UserRole } from '../users/entities/user.entity';

/**
 * Lo mínimo que necesita el gate: id del curso, si es pago y de quién es.
 * La forma de `instructor` es la de la entidad Course, así que se le puede
 * pasar `lesson.module.course` tal cual — pero SOLO da acceso si la query
 * joineó la relación (si no viene, se ignora y se sigue con el resto).
 */
export interface CourseAccessInfo {
    id: string;
    priceInCents: number;
    instructor?: { id: string } | null;
}

/** El gate necesita el rol, no sólo el id: un ADMIN entra sin estar inscripto. */
export interface AccessActor {
    id: string;
    role?: UserRole;
}

/** Lo que importa de la lección para el gate: si es de muestra. */
export interface LessonAccessInfo {
    isFree?: boolean;
}

/**
 * Resuelve si un usuario puede ver el CONTENIDO real (content/videoUrl, PDFs
 * adjuntos) de una lección, según la lección y el curso al que pertenece.
 *
 * Regla, en orden:
 *  - ADMIN o TEACHER → siempre sí. Administran/arman el catálogo; exigirles
 *    inscripción haría que no puedan ver ni lo que cargan.
 *  - instructor del curso → siempre sí, por el mismo motivo.
 *  - lección de muestra (`lesson.isFree`) → sí, en cualquier curso, gratis o
 *    pago. Es la vista previa.
 *  - el resto → sólo con inscripción ACTIVA a ese curso o una suscripción
 *    ACTIVE (el plan da acceso a todo el catálogo). Vale también para los
 *    cursos gratis: inscribirse es gratis (POST /course-enrollments) y el
 *    front inscribe solo al entrar a una lección.
 *
 * `lesson` es opcional para no romper a quien pregunte sólo por el curso: sin
 * ella no hay vista previa y aplica la regla de inscripción.
 */
@Injectable()
export class LessonsAccessService {
    constructor(
        private readonly enrollments: CourseEnrollmentsService,
        private readonly subscriptions: SubscriptionsService,
    ) { }

    async canAccessCourseContent(
        user: AccessActor,
        course: CourseAccessInfo | null | undefined,
        lesson?: LessonAccessInfo | null,
    ): Promise<boolean> {
        if (!course || !user?.id) return false;

        if (user.role === UserRole.ADMIN || user.role === UserRole.TEACHER) return true;
        if (course.instructor?.id && course.instructor.id === user.id) return true;

        if (lesson?.isFree) return true;

        if (await this.enrollments.hasActiveEnrollment(user.id, course.id)) {
            return true;
        }
        return this.subscriptions.hasActiveSubscription(user.id);
    }
}
