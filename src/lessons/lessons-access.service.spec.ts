import { LessonsAccessService } from './lessons-access.service';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UserRole } from '../users/entities/user.entity';

/**
 * Unit del gate de acceso a contenido. Los dos building blocks
 * (hasActiveEnrollment / hasActiveSubscription) se mockean: acá se prueba la
 * REGLA de combinación, no su implementación.
 */

const INSTRUCTOR_ID = 'teacher-1';

const FREE_COURSE = { id: 'c-free', priceInCents: 0 };
const PAID_COURSE = {
    id: 'c-paid',
    priceInCents: 4999,
    instructor: { id: INSTRUCTOR_ID },
};

/** Alumno común, el caso por defecto. */
const STUDENT = { id: 'u1', role: UserRole.STUDENT };

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
            service.canAccessCourseContent(STUDENT, FREE_COURSE),
        ).resolves.toBe(true);

        expect(hasActiveEnrollment).not.toHaveBeenCalled();
        expect(hasActiveSubscription).not.toHaveBeenCalled();
    });

    it('curso pago, sin enrollment ni suscripción → false', async () => {
        const { service } = makeService();
        await expect(
            service.canAccessCourseContent(STUDENT, PAID_COURSE),
        ).resolves.toBe(false);
    });

    it('curso pago, con inscripción activa → true', async () => {
        const { service, hasActiveEnrollment } = makeService();
        hasActiveEnrollment.mockResolvedValueOnce(true);

        await expect(
            service.canAccessCourseContent(STUDENT, PAID_COURSE),
        ).resolves.toBe(true);
        expect(hasActiveEnrollment).toHaveBeenCalledWith(STUDENT.id, PAID_COURSE.id);
    });

    it('curso pago, sin inscripción pero con suscripción ACTIVE → true', async () => {
        const { service, hasActiveSubscription } = makeService();
        hasActiveSubscription.mockResolvedValueOnce(true);

        await expect(
            service.canAccessCourseContent(STUDENT, PAID_COURSE),
        ).resolves.toBe(true);
    });

    it('curso pago, inscripción CANCELADA (hasActiveEnrollment=false) y sin suscripción → false', async () => {
        const { service, hasActiveEnrollment, hasActiveSubscription } = makeService();
        // hasActiveEnrollment ya filtra isActive:true, así que una inscripción
        // cancelada llega acá como `false`.
        hasActiveEnrollment.mockResolvedValueOnce(false);
        hasActiveSubscription.mockResolvedValueOnce(false);

        await expect(
            service.canAccessCourseContent(STUDENT, PAID_COURSE),
        ).resolves.toBe(false);
    });

    it('sin curso (relación no cargada) → false', async () => {
        const { service } = makeService();
        await expect(
            service.canAccessCourseContent(STUDENT, null),
        ).resolves.toBe(false);
    });

    // Sin estas dos excepciones, quien administra el catálogo no puede ver ni
    // el contenido que él mismo carga (ni descargar los PDFs que adjunta).
    it('ADMIN sin inscripción → true, sin consultar nada', async () => {
        const { service, hasActiveEnrollment, hasActiveSubscription } = makeService();

        await expect(
            service.canAccessCourseContent(
                { id: 'admin-1', role: UserRole.ADMIN },
                PAID_COURSE,
            ),
        ).resolves.toBe(true);

        expect(hasActiveEnrollment).not.toHaveBeenCalled();
        expect(hasActiveSubscription).not.toHaveBeenCalled();
    });

    it('instructor del curso sin inscripción → true', async () => {
        const { service, hasActiveEnrollment } = makeService();

        await expect(
            service.canAccessCourseContent(
                { id: INSTRUCTOR_ID, role: UserRole.TEACHER },
                PAID_COURSE,
            ),
        ).resolves.toBe(true);

        expect(hasActiveEnrollment).not.toHaveBeenCalled();
    });

    it('instructor de OTRO curso → sigue la regla normal (false)', async () => {
        const { service } = makeService();

        await expect(
            service.canAccessCourseContent(
                { id: 'teacher-2', role: UserRole.TEACHER },
                PAID_COURSE,
            ),
        ).resolves.toBe(false);
    });

    it('si la relación instructor no vino en la query, no da acceso por error', async () => {
        const { service } = makeService();
        const courseSinInstructor = { id: 'c-paid', priceInCents: 4999 };

        await expect(
            service.canAccessCourseContent(
                { id: INSTRUCTOR_ID, role: UserRole.TEACHER },
                courseSinInstructor,
            ),
        ).resolves.toBe(false);
    });

    it('sin usuario → false', async () => {
        const { service } = makeService();
        await expect(
            service.canAccessCourseContent({ id: '' }, FREE_COURSE),
        ).resolves.toBe(false);
    });
});
