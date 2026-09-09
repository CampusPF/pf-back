import { Injectable } from '@nestjs/common';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

/** Lo mínimo que necesita el gate: id del curso y si es pago. */
export interface CourseAccessInfo {
    id: string;
    priceInCents: number;
}

/**
 * Resuelve si un usuario puede ver el CONTENIDO real (content/videoUrl) de una
 * lección, según el curso al que pertenece.
 *
 * Regla:
 *  - curso gratis (priceInCents === 0) → siempre sí. NO se exige enrollment:
 *    hoy nada crea una CourseEnrollment automática para cursos gratis, exigirla
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
        userId: string,
        course: CourseAccessInfo | null | undefined,
    ): Promise<boolean> {
        if (!course) return false;
        if (course.priceInCents === 0) return true;

        if (await this.enrollments.hasActiveEnrollment(userId, course.id)) {
            return true;
        }
        return this.subscriptions.hasActiveSubscription(userId);
    }
}
