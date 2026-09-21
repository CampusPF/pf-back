import { EmailNotificationsService } from './email-notifications.service';
import { UserRole } from '../users/entities/user.entity';
import { PaymentType } from '../payments/entities/payment.entity';
import { MailTemplate } from '../mail/mail-templates';

/**
 * Foco: qué plantilla y qué params se mandan en cada caso, y que la
 * dedupeKey evita mandar dos veces el mismo mail. MailService va mockeado:
 * no se toca Brevo.
 */

const CONFIG: Record<string, unknown> = {
    FRONTEND_URL: 'https://campus.test,http://localhost:3000',
    BREVO_TPL_WELCOME_STUDENT: 1,
    BREVO_TPL_WELCOME_TEACHER: 2,
    BREVO_TPL_WELCOME_ADMIN: 3,
    BREVO_TPL_COURSE_ENROLLED: 4,
    BREVO_TPL_COURSE_PURCHASED: 5,
    BREVO_TPL_PREMIUM_CONFIRMED: 6,
    BREVO_TPL_TEACHER_NEW_STUDENT: 7,
};

const STUDENT = { id: 'u-1', name: 'Ana', email: 'ana@test.com', role: UserRole.STUDENT };
const TEACHER = { id: 't-1', name: 'Tomás', email: 'tomas@test.com', role: UserRole.TEACHER };

function makeService() {
    // Simula el índice único (userId, dedupeKey) de la tabla notification.
    const taken = new Set<string>();
    let seq = 0;
    let pendingValues: { userId: string; dedupeKey: string } | null = null;
    const insertBuilder = {
        insert: () => insertBuilder,
        into: () => insertBuilder,
        values: (v: { userId: string; dedupeKey: string }) => {
            pendingValues = v;
            return insertBuilder;
        },
        orIgnore: () => insertBuilder,
        returning: () => insertBuilder,
        execute: async () => {
            const key = `${pendingValues!.userId}|${pendingValues!.dedupeKey}`;
            if (taken.has(key)) return { raw: [] };
            taken.add(key);
            return { raw: [{ id: `n-${++seq}` }] };
        },
    };
    const notificationsRepo = {
        createQueryBuilder: () => insertBuilder,
        update: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
    };

    const userQuery = { addSelect: () => userQuery, where: () => userQuery, getOne: jest.fn() };
    const usersRepo = {
        createQueryBuilder: () => userQuery,
        findOne: jest.fn(),
    };

    const syllabusQuery = {
        leftJoinAndSelect: () => syllabusQuery,
        where: () => syllabusQuery,
        orderBy: () => syllabusQuery,
        addOrderBy: () => syllabusQuery,
        getOne: jest.fn(),
    };
    const coursesRepo = { createQueryBuilder: () => syllabusQuery, findOne: jest.fn() };
    const enrollmentsRepo = { count: jest.fn(async () => 12) };
    const paymentsRepo = { findOne: jest.fn() };
    const subscriptionsRepo = { findOne: jest.fn() };

    const mail = { sendTemplate: jest.fn(async () => undefined) };
    const config = { get: (key: string) => CONFIG[key] };
    const resetTokens = { generate: jest.fn(() => 'reset-token') };

    const service = new EmailNotificationsService(
        mail as any,
        config as any,
        resetTokens as any,
        notificationsRepo as any,
        usersRepo as any,
        coursesRepo as any,
        enrollmentsRepo as any,
        paymentsRepo as any,
        subscriptionsRepo as any,
    );

    return {
        service,
        mail,
        notificationsRepo,
        userQuery,
        usersRepo,
        syllabusQuery,
        coursesRepo,
        paymentsRepo,
        subscriptionsRepo,
    };
}

describe('EmailNotificationsService', () => {
    describe('bienvenida', () => {
        it.each([
            [UserRole.STUDENT, 1],
            [UserRole.TEACHER, 2],
            [UserRole.ADMIN, 3],
        ])('rol %s → plantilla %i', async (role, expectedTemplate) => {
            const { service, mail, userQuery } = makeService();
            userQuery.getOne.mockResolvedValueOnce({ ...STUDENT, role, passwordHash: 'h' });

            await service.sendWelcome('u-1', false);

            expect(mail.sendTemplate).toHaveBeenCalledWith(
                { email: 'ana@test.com', name: 'Ana' },
                expectedTemplate,
                expect.objectContaining({
                    name: 'Ana',
                    // FRONTEND_URL es una lista: se usa la primera.
                    dashboardUrl: 'https://campus.test/dashboard',
                }),
                [`welcome-${role}`],
            );
        });

        it('setPasswordUrl sólo si la cuenta la creó un admin', async () => {
            const { service, mail, userQuery } = makeService();
            userQuery.getOne.mockResolvedValue({ ...TEACHER, passwordHash: 'h' });

            await service.sendWelcome('t-1', true);
            const params = (mail.sendTemplate.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
            expect(params.setPasswordUrl).toBe('https://campus.test/reset-password?token=reset-token');

            const other = makeService();
            other.userQuery.getOne.mockResolvedValue({ ...STUDENT, passwordHash: 'h' });
            await other.service.sendWelcome('u-1', false);
            const params2 = (other.mail.sendTemplate.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
            expect(params2.setPasswordUrl).toBeUndefined();
        });
    });

    describe('inscripción', () => {
        const COURSE = {
            id: 'c-1',
            title: 'NestJS',
            slug: 'nestjs',
            imageUrl: null,
            instructor: TEACHER,
            modules: [
                {
                    title: 'Intro',
                    lessons: [
                        { id: 'l-1', title: 'Hola', durationMinutes: 5 },
                        { id: 'l-2', title: 'Setup', durationMinutes: 10 },
                    ],
                },
                { title: 'Avanzado', lessons: [{ id: 'l-3', title: 'Guards', durationMinutes: 20 }] },
            ],
        };

        it('manda el temario y el link a la primera lección', async () => {
            const { service, mail, usersRepo, syllabusQuery } = makeService();
            usersRepo.findOne.mockResolvedValueOnce(STUDENT);
            syllabusQuery.getOne.mockResolvedValueOnce(COURSE);

            await service.sendCourseEnrolled('u-1', 'c-1', 'e-1');

            expect(mail.sendTemplate).toHaveBeenCalledWith(
                expect.anything(),
                4,
                expect.objectContaining({
                    courseTitle: 'NestJS',
                    firstLessonUrl: 'https://campus.test/courses/nestjs/learn/l-1',
                    totalLessons: 3,
                    totalMinutes: 35,
                    modules: [
                        {
                            title: 'Intro',
                            lessons: [
                                { title: 'Hola', duration: 5 },
                                { title: 'Setup', duration: 10 },
                            ],
                        },
                        { title: 'Avanzado', lessons: [{ title: 'Guards', duration: 20 }] },
                    ],
                }),
                ['course-enrolled'],
            );
        });

        it('el mismo evento dos veces → un solo mail', async () => {
            const { service, mail, usersRepo, syllabusQuery } = makeService();
            usersRepo.findOne.mockResolvedValue(STUDENT);
            syllabusQuery.getOne.mockResolvedValue(COURSE);

            await service.sendCourseEnrolled('u-1', 'c-1', 'e-1');
            await service.sendCourseEnrolled('u-1', 'c-1', 'e-1');

            expect(mail.sendTemplate).toHaveBeenCalledTimes(1);
        });

        it('avisa al docente del curso', async () => {
            const { service, mail, usersRepo, coursesRepo } = makeService();
            usersRepo.findOne.mockResolvedValueOnce(STUDENT);
            coursesRepo.findOne.mockResolvedValueOnce(COURSE);

            await service.sendTeacherNewStudent('u-1', 'c-1', 'e-1');

            expect(mail.sendTemplate).toHaveBeenCalledWith(
                { email: 'tomas@test.com', name: 'Tomás' },
                7,
                expect.objectContaining({
                    studentName: 'Ana',
                    courseTitle: 'NestJS',
                    totalStudents: 12,
                }),
                ['teacher-new-student'],
            );
        });

        it('el docente inscripto a su propio curso no se avisa a sí mismo', async () => {
            const { service, mail, usersRepo, coursesRepo } = makeService();
            usersRepo.findOne.mockResolvedValueOnce(TEACHER);
            coursesRepo.findOne.mockResolvedValueOnce(COURSE);

            await service.sendTeacherNewStudent('t-1', 'c-1', 'e-1');

            expect(mail.sendTemplate).not.toHaveBeenCalled();
        });
    });

    describe('pago confirmado', () => {
        it('pago de curso → plantilla de compra', async () => {
            const { service, mail, paymentsRepo } = makeService();
            paymentsRepo.findOne.mockResolvedValueOnce({
                id: 'p-1',
                type: PaymentType.COURSE,
                user: STUDENT,
                course: { title: 'NestJS', slug: 'nestjs' },
                amountInCents: 4999,
                currency: 'usd',
                updatedAt: new Date('2026-09-21T12:00:00Z'),
            });

            await service.sendPaymentSucceeded('p-1');

            expect(mail.sendTemplate).toHaveBeenCalledWith(
                expect.anything(),
                5,
                expect.objectContaining({ courseTitle: 'NestJS', currency: 'USD', paymentId: 'p-1' }),
                ['course-purchased'],
            );
        });

        it('pago de suscripción → plantilla Premium', async () => {
            const { service, mail, paymentsRepo, subscriptionsRepo } = makeService();
            paymentsRepo.findOne.mockResolvedValueOnce({
                id: 'p-2',
                type: PaymentType.SUBSCRIPTION,
                user: STUDENT,
                course: null,
                amountInCents: 999,
                currency: 'usd',
            });
            subscriptionsRepo.findOne.mockResolvedValueOnce({
                endDate: new Date('2026-10-21T12:00:00Z'),
            });

            await service.sendPaymentSucceeded('p-2');

            expect(mail.sendTemplate).toHaveBeenCalledWith(
                expect.anything(),
                6,
                expect.objectContaining({ planName: 'Premium', validUntil: expect.any(String) }),
                ['premium-confirmed'],
            );
        });
    });

    describe('deliver', () => {
        it('si Brevo falla, libera la dedupeKey para poder reintentar', async () => {
            const { service, mail, notificationsRepo } = makeService();
            mail.sendTemplate.mockRejectedValueOnce(new Error('brevo caído'));

            const ok = await service.deliver({
                user: STUDENT,
                type: 'x',
                dedupeKey: 'k',
                template: MailTemplate.WELCOME_STUDENT,
                params: {},
                title: 't',
                message: 'm',
                tag: 'x',
            });

            expect(ok).toBe(false);
            expect(notificationsRepo.delete).toHaveBeenCalledWith('n-1');
            expect(notificationsRepo.update).not.toHaveBeenCalled();
        });
    });
});
