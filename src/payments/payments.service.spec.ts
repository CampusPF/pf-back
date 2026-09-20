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
        if (where.stripePaymentIntentId) {
            return (
                this.rows.find(
                    (r) => r.stripePaymentIntentId === where.stripePaymentIntentId,
                ) ?? null
            );
        }

        // Búsqueda del pendiente reutilizable (order createdAt DESC → el último).
        const matches = this.rows.filter(
            (r) =>
                (r.user as any)?.id === where.user?.id &&
                r.type === where.type &&
                r.status === where.status &&
                (where.course ? (r.course as any)?.id === where.course.id : true) &&
                (where.plan ? r.plan === where.plan : true),
        );
        return matches[matches.length - 1] ?? null;
    }
}

const FREE_COURSE = { id: 'course-free', priceInCents: 0, currency: 'usd' };
const PAID_COURSE = { id: 'course-paid', priceInCents: 4999, currency: 'usd' };

function makeService() {
    let intentCounter = 0;
    // Los intents creados, para que retrieve() los devuelva como haría Stripe.
    const intents = new Map<string, any>();
    const paymentIntentsCreate = jest.fn(async (params: any) => {
        intentCounter += 1;
        const intent = {
            id: `pi_${intentCounter}`,
            client_secret: `pi_${intentCounter}_secret_test`,
            amount: params.amount,
            amount_received: params.amount,
            currency: params.currency,
            metadata: params.metadata,
            status: 'requires_payment_method',
        };
        intents.set(intent.id, intent);
        return intent;
    });
    const paymentIntentsRetrieve = jest.fn(async (id: string) => {
        const intent = intents.get(id);
        if (!intent) throw new Error(`No such payment_intent: ${id}`);
        return intent;
    });

    const stripeService = {
        stripe: {
            paymentIntents: { create: paymentIntentsCreate, retrieve: paymentIntentsRetrieve },
        },
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
        paymentIntentsRetrieve,
        intents,
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

    describe('reutiliza el pago pendiente', () => {
        it('segunda visita al mismo curso → mismo clientSecret, sin PaymentIntent ni fila nuevos', async () => {
            const { service, paymentsRepo, paymentIntentsCreate } = makeService();

            const first = await service.createIntent('user-1', { courseId: PAID_COURSE.id });
            const second = await service.createIntent('user-1', { courseId: PAID_COURSE.id });

            expect(second.clientSecret).toBe(first.clientSecret);
            expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
            expect(paymentsRepo.rows).toHaveLength(1);
        });

        it('otro usuario, mismo curso → NO reutiliza el pendiente ajeno', async () => {
            const { service, paymentsRepo, paymentIntentsCreate } = makeService();

            const a = await service.createIntent('user-1', { courseId: PAID_COURSE.id });
            const b = await service.createIntent('user-2', { courseId: PAID_COURSE.id });

            expect(b.clientSecret).not.toBe(a.clientSecret);
            expect(paymentIntentsCreate).toHaveBeenCalledTimes(2);
            expect(paymentsRepo.rows).toHaveLength(2);
        });

        it('el precio del curso cambió → el intent viejo ya no vale, crea uno nuevo', async () => {
            const { service, paymentIntentsCreate } = makeService();
            await service.createIntent('user-1', { courseId: PAID_COURSE.id });

            const originalPrice = PAID_COURSE.priceInCents;
            PAID_COURSE.priceInCents = 5999;
            try {
                await service.createIntent('user-1', { courseId: PAID_COURSE.id });
            } finally {
                PAID_COURSE.priceInCents = originalPrice;
            }

            expect(paymentIntentsCreate).toHaveBeenCalledTimes(2);
            expect(paymentIntentsCreate.mock.calls[1][0].amount).toBe(5999);
        });

        it.each(['canceled', 'succeeded', 'processing'])(
            'el PaymentIntent quedó en "%s" (ya no se puede pagar) → crea uno nuevo',
            async (status) => {
                const { service, intents, paymentIntentsCreate } = makeService();
                await service.createIntent('user-1', { courseId: PAID_COURSE.id });
                intents.get('pi_1').status = status;

                await service.createIntent('user-1', { courseId: PAID_COURSE.id });

                expect(paymentIntentsCreate).toHaveBeenCalledTimes(2);
            },
        );

        it('un intent que espera acción del usuario (3DS) SÍ se reutiliza', async () => {
            const { service, intents, paymentIntentsCreate } = makeService();
            const first = await service.createIntent('user-1', { courseId: PAID_COURSE.id });
            intents.get('pi_1').status = 'requires_action';

            const second = await service.createIntent('user-1', { courseId: PAID_COURSE.id });

            expect(second.clientSecret).toBe(first.clientSecret);
            expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
        });

        it('Stripe falla al consultar el intent viejo → no bloquea la compra, crea uno nuevo', async () => {
            const { service, paymentIntentsCreate, paymentIntentsRetrieve } = makeService();
            await service.createIntent('user-1', { courseId: PAID_COURSE.id });
            paymentIntentsRetrieve.mockRejectedValueOnce(new Error('Stripe caído'));

            const { clientSecret } = await service.createIntent('user-1', {
                courseId: PAID_COURSE.id,
            });

            expect(clientSecret).toMatch(/_secret_/);
            expect(paymentIntentsCreate).toHaveBeenCalledTimes(2);
        });

        it('suscripción: segunda visita al mismo plan → reutiliza', async () => {
            const { service, paymentsRepo, paymentIntentsCreate } = makeService();

            const first = await service.createIntent('user-1', {
                planId: SubscriptionPlan.PREMIUM,
            });
            const second = await service.createIntent('user-1', {
                planId: SubscriptionPlan.PREMIUM,
            });

            expect(second.clientSecret).toBe(first.clientSecret);
            expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
            expect(paymentsRepo.rows).toHaveLength(1);
        });

        it('un pendiente de curso NO se reutiliza para una suscripción (ni al revés)', async () => {
            const { service, paymentIntentsCreate } = makeService();

            await service.createIntent('user-1', { courseId: PAID_COURSE.id });
            await service.createIntent('user-1', { planId: SubscriptionPlan.PREMIUM });

            expect(paymentIntentsCreate).toHaveBeenCalledTimes(2);
        });

        it('un pago ya exitoso (succeeded) no se reutiliza: sólo los pendientes', async () => {
            const { service, paymentsRepo, paymentIntentsCreate } = makeService();
            await service.createIntent('user-1', { courseId: PAID_COURSE.id });
            paymentsRepo.rows[0].status = PaymentStatus.SUCCEEDED;

            await service.createIntent('user-1', { courseId: PAID_COURSE.id });

            expect(paymentIntentsCreate).toHaveBeenCalledTimes(2);
        });
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
