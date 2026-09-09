import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus, PaymentType } from './entities/payment.entity';
import { StripeService } from './stripe.service';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SubscriptionPlan } from '../subscriptions/entities/subscription.entity';

/**
 * Tests de PaymentsService sin Nest DI: se instancia la clase a mano con
 * fakes, igual que auth.service.spec.ts. Lo que importa validar acá es la
 * lógica de negocio (qué se rechaza, qué activa acceso, idempotencia del
 * webhook), no el cableado de TypeORM.
 */

class FakePaymentsRepository {
    rows: Payment[] = [];

    create(partial: Partial<Payment>): Payment {
        return { ...partial } as Payment;
    }

    async save(payment: Payment): Promise<Payment> {
        if (!payment.id) {
            payment.id = `pay-${this.rows.length + 1}`;
            this.rows.push(payment);
        } else {
            const i = this.rows.findIndex((r) => r.id === payment.id);
            if (i >= 0) this.rows[i] = payment;
            else this.rows.push(payment);
        }
        return payment;
    }

    async findOne({ where }: any): Promise<Payment | null> {
        return (
            this.rows.find(
                (r) => r.stripePaymentIntentId === where.stripePaymentIntentId,
            ) ?? null
        );
    }
}

const FREE_COURSE = { id: 'course-free', priceInCents: 0, currency: 'usd' };
const PAID_COURSE = { id: 'course-paid', priceInCents: 4999, currency: 'usd' };

function makeService() {
    let intentCounter = 0;
    const paymentIntentsCreate = jest.fn(async (params: any) => {
        intentCounter += 1;
        return {
            id: `pi_${intentCounter}`,
            client_secret: `pi_${intentCounter}_secret_test`,
            amount: params.amount,
            amount_received: params.amount,
            currency: params.currency,
            metadata: params.metadata,
        };
    });

    const stripeService = {
        stripe: { paymentIntents: { create: paymentIntentsCreate } },
    } as unknown as StripeService;

    const paymentsRepo = new FakePaymentsRepository();

    const coursesRepo = {
        findOne: jest.fn(async ({ where }: any) =>
            [FREE_COURSE, PAID_COURSE].find((c) => c.id === where.id) ?? null,
        ),
    };

    const enrollmentsService = {
        hasActiveEnrollment: jest.fn(async () => false),
        create: jest.fn(async () => ({ id: 'enr-1' })),
    } as unknown as CourseEnrollmentsService;

    const subscriptionsService = {
        getPlanPriceInCents: (plan: SubscriptionPlan) =>
            plan === SubscriptionPlan.PREMIUM ? 999 : 0,
        hasActiveSubscription: jest.fn(async () => false),
        activateFromPayment: jest.fn(async () => ({ id: 'sub-1' })),
    } as unknown as SubscriptionsService;

    const service = new PaymentsService(
        stripeService,
        paymentsRepo as any,
        coursesRepo as any,
        enrollmentsService,
        subscriptionsService,
    );

    return {
        service,
        paymentsRepo,
        paymentIntentsCreate,
        enrollmentsService,
        subscriptionsService,
    };
}

/** Arma el objeto payment_intent que mandaría Stripe en el webhook. */
function intentFromPayment(payment: Payment, overrides: Record<string, unknown> = {}) {
    return {
        id: payment.stripePaymentIntentId,
        amount: payment.amountInCents,
        amount_received: payment.amountInCents,
        currency: payment.currency,
        ...overrides,
    } as any;
}

describe('PaymentsService.createIntent', () => {
    it('curso gratis → 400, no crea PaymentIntent', async () => {
        const { service, paymentIntentsCreate, paymentsRepo } = makeService();

        await expect(
            service.createIntent('user-1', { courseId: FREE_COURSE.id }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(paymentIntentsCreate).not.toHaveBeenCalled();
        expect(paymentsRepo.rows).toHaveLength(0);
    });

    it('curso inexistente → 404', async () => {
        const { service } = makeService();
        await expect(
            service.createIntent('user-1', { courseId: 'no-existe' }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ya inscripto al curso → 409', async () => {
        const { service, enrollmentsService } = makeService();
        (enrollmentsService.hasActiveEnrollment as jest.Mock).mockResolvedValueOnce(true);

        await expect(
            service.createIntent('user-1', { courseId: PAID_COURSE.id }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('ya tiene suscripción activa → 409', async () => {
        const { service, subscriptionsService } = makeService();
        (subscriptionsService.hasActiveSubscription as jest.Mock).mockResolvedValueOnce(
            true,
        );

        await expect(
            service.createIntent('user-1', { planId: SubscriptionPlan.PREMIUM }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('plan FREE (precio 0) → 400', async () => {
        const { service } = makeService();
        await expect(
            service.createIntent('user-1', { planId: SubscriptionPlan.FREE }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('curso pago OK → devuelve clientSecret y guarda un Payment pending', async () => {
        const { service, paymentsRepo } = makeService();

        const { clientSecret } = await service.createIntent('user-1', {
            courseId: PAID_COURSE.id,
        });

        expect(clientSecret).toMatch(/_secret_/);
        expect(paymentsRepo.rows).toHaveLength(1);
        const [payment] = paymentsRepo.rows;
        expect(payment.status).toBe(PaymentStatus.PENDING);
        expect(payment.type).toBe(PaymentType.COURSE);
        expect(payment.amountInCents).toBe(PAID_COURSE.priceInCents);
        expect(payment.stripePaymentIntentId).toBeDefined();
    });
});

describe('PaymentsService.handlePaymentSucceeded', () => {
    it('type=course → crea la CourseEnrollment (allowPaid) y marca el Payment succeeded', async () => {
        const { service, paymentsRepo, enrollmentsService } = makeService();
        await service.createIntent('user-1', { courseId: PAID_COURSE.id });
        const payment = paymentsRepo.rows[0];

        await service.handlePaymentSucceeded(intentFromPayment(payment));

        expect(enrollmentsService.create).toHaveBeenCalledWith(
            { courseId: PAID_COURSE.id },
            'user-1',
            { allowPaid: true },
        );
        expect(paymentsRepo.rows[0].status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('type=subscription → activa la Subscription y marca el Payment succeeded', async () => {
        const { service, paymentsRepo, subscriptionsService } = makeService();
        await service.createIntent('user-1', { planId: SubscriptionPlan.PREMIUM });
        const payment = paymentsRepo.rows[0];

        await service.handlePaymentSucceeded(intentFromPayment(payment));

        expect(subscriptionsService.activateFromPayment).toHaveBeenCalledWith(
            'user-1',
            SubscriptionPlan.PREMIUM,
            999,
        );
        expect(paymentsRepo.rows[0].status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('evento duplicado (mismo payment_intent.id) → NO crea dos CourseEnrollment', async () => {
        const { service, paymentsRepo, enrollmentsService } = makeService();
        await service.createIntent('user-1', { courseId: PAID_COURSE.id });
        const intent = intentFromPayment(paymentsRepo.rows[0]);

        await service.handlePaymentSucceeded(intent);
        await service.handlePaymentSucceeded(intent);
        await service.handlePaymentSucceeded(intent);

        expect(enrollmentsService.create).toHaveBeenCalledTimes(1);
    });

    it('evento duplicado type=subscription → NO activa dos Subscription', async () => {
        const { service, paymentsRepo, subscriptionsService } = makeService();
        await service.createIntent('user-1', { planId: SubscriptionPlan.PREMIUM });
        const intent = intentFromPayment(paymentsRepo.rows[0]);

        await service.handlePaymentSucceeded(intent);
        await service.handlePaymentSucceeded(intent);

        expect(subscriptionsService.activateFromPayment).toHaveBeenCalledTimes(1);
    });

    it('intent sin Payment local → no hace nada (no crea acceso)', async () => {
        const { service, enrollmentsService, subscriptionsService } = makeService();

        await service.handlePaymentSucceeded({
            id: 'pi_desconocido',
            amount: 4999,
            amount_received: 4999,
            currency: 'usd',
        } as any);

        expect(enrollmentsService.create).not.toHaveBeenCalled();
        expect(subscriptionsService.activateFromPayment).not.toHaveBeenCalled();
    });

    it('monto cobrado ≠ monto guardado → marca failed y NO da acceso', async () => {
        const { service, paymentsRepo, enrollmentsService } = makeService();
        await service.createIntent('user-1', { courseId: PAID_COURSE.id });
        const payment = paymentsRepo.rows[0];

        await service.handlePaymentSucceeded(
            intentFromPayment(payment, { amount_received: 1 }),
        );

        expect(enrollmentsService.create).not.toHaveBeenCalled();
        expect(paymentsRepo.rows[0].status).toBe(PaymentStatus.FAILED);
    });
});
