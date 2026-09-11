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

/**
 * Resuelve si un usuario puede ver el CONTENIDO real (content/videoUrl, PDFs
 * adjuntos) de una lección, según el curso al que pertenece.
 *
 * Regla, en orden:
 *  - ADMIN → siempre sí. Administra el catálogo; exigirle inscripción haría
 *    que no pueda ver ni lo que él mismo carga.
 *  - instructor del curso → siempre sí, por el mismo motivo.
 *  - curso gratis (priceInCents === 0) → sí. NO se exige enrollment: hoy nada
 *    crea una CourseEnrollment automática para cursos gratis, exigirla
 *    rompería todo lo que ya funciona.
 *  - curso pago → sí solo si el usuario tiene una inscripción ACTIVA a ese
 *    curso, o una suscripción ACTIVE (el plan da acceso a todo el catálogo).
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
    ): Promise<boolean> {
        if (!course || !user?.id) return false;

        if (user.role === UserRole.ADMIN) return true;
        if (course.instructor?.id && course.instructor.id === user.id) return true;

        if (course.priceInCents === 0) return true;

        if (await this.enrollments.hasActiveEnrollment(user.id, course.id)) {
            return true;
        }
        return this.subscriptions.hasActiveSubscription(user.id);
    }
}
