import { LessonsAccessService } from './lessons-access.service';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

/**
 * Unit del gate de acceso a contenido. Los dos building blocks
 * (hasActiveEnrollment / hasActiveSubscription) se mockean: acá se prueba la
 * REGLA de combinación, no su implementación.
 */

const FREE_COURSE = { id: 'c-free', priceInCents: 0 };
const PAID_COURSE = { id: 'c-paid', priceInCents: 4999 };

function makeService() {
    const hasActiveEnrollment = jest.fn(async () => false);
    const hasActiveSubscription = jest.fn(async () => false);

    const service = new LessonsAccessService(
        { hasActiveEnrollment } as unknown as CourseEnrollmentsService,
        { hasActiveSubscription } as unknown as SubscriptionsService,
    );

    return { service, hasActiveEnrollment, hasActiveSubscription };
}

describe('LessonsAccessService.canAccessCourseContent', () => {
    it('curso gratis → true sin consultar enrollment ni suscripción', async () => {
        const { service, hasActiveEnrollment, hasActiveSubscription } = makeService();

        await expect(
            service.canAccessCourseContent('u1', FREE_COURSE),
        ).resolves.toBe(true);

        expect(hasActiveEnrollment).not.toHaveBeenCalled();
        expect(hasActiveSubscription).not.toHaveBeenCalled();
    });

    it('curso pago, sin enrollment ni suscripción → false', async () => {
        const { service } = makeService();
        await expect(
            service.canAccessCourseContent('u1', PAID_COURSE),
        ).resolves.toBe(false);
    });

    it('curso pago, con inscripción activa → true', async () => {
        const { service, hasActiveEnrollment } = makeService();
        hasActiveEnrollment.mockResolvedValueOnce(true);

        await expect(
            service.canAccessCourseContent('u1', PAID_COURSE),
        ).resolves.toBe(true);
        expect(hasActiveEnrollment).toHaveBeenCalledWith('u1', PAID_COURSE.id);
    });

    it('curso pago, sin inscripción pero con suscripción ACTIVE → true', async () => {
        const { service, hasActiveSubscription } = makeService();
        hasActiveSubscription.mockResolvedValueOnce(true);

        await expect(
            service.canAccessCourseContent('u1', PAID_COURSE),
        ).resolves.toBe(true);
    });

    it('curso pago, inscripción CANCELADA (hasActiveEnrollment=false) y sin suscripción → false', async () => {
        const { service, hasActiveEnrollment, hasActiveSubscription } = makeService();
        // hasActiveEnrollment ya filtra isActive:true, así que una inscripción
        // cancelada llega acá como `false`.
        hasActiveEnrollment.mockResolvedValueOnce(false);
        hasActiveSubscription.mockResolvedValueOnce(false);

        await expect(
            service.canAccessCourseContent('u1', PAID_COURSE),
        ).resolves.toBe(false);
    });

    it('sin curso (relación no cargada) → false', async () => {
        const { service } = makeService();
        await expect(service.canAccessCourseContent('u1', null)).resolves.toBe(false);
    });
});
