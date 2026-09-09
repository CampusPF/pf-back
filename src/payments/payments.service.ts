import {
    Injectable,
    Logger,
    BadRequestException,
    ConflictException,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payment, PaymentStatus, PaymentType } from './entities/payment.entity';
import { Course } from '../courses/entities/course.entity';
import { User } from '../users/entities/user.entity';
import { StripeService } from './stripe.service';
import { CreateIntentDto } from './dto/create-intent.dto';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import {
    SubscriptionsService,
    PLAN_CURRENCY,
} from '../subscriptions/subscriptions.service';
import { SubscriptionPlan } from '../subscriptions/entities/subscription.entity';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly stripeService: StripeService,
        @InjectRepository(Payment)
        private readonly paymentsRepository: Repository<Payment>,
        @InjectRepository(Course)
        private readonly coursesRepository: Repository<Course>,
        private readonly enrollmentsService: CourseEnrollmentsService,
        private readonly subscriptionsService: SubscriptionsService,
    ) { }

    /**
     * Contrato con el front (Stripe Elements / PaymentElement):
     *   POST /payments/create-intent  { courseId } | { planId }
     *   → { clientSecret }   (de un PaymentIntent, no de un Checkout Session)
     */
    async createIntent(
        userId: string,
        dto: CreateIntentDto,
    ): Promise<{ clientSecret: string }> {
        // El DTO ya garantiza que viene exactamente uno de los dos.
        if (dto.courseId) {
            return this.createCourseIntent(userId, dto.courseId);
        }
        return this.createSubscriptionIntent(userId, dto.planId as SubscriptionPlan);
    }

    private async createCourseIntent(
        userId: string,
        courseId: string,
    ): Promise<{ clientSecret: string }> {
        const course = await this.coursesRepository.findOne({ where: { id: courseId } });
        if (!course) {
            throw new NotFoundException(`Curso con id ${courseId} no encontrado`);
        }
        if (course.priceInCents <= 0) {
            throw new BadRequestException('Este curso es gratis: no requiere pago.');
        }
        if (await this.enrollmentsService.hasActiveEnrollment(userId, courseId)) {
            throw new ConflictException('Ya estás inscripto en este curso');
        }

        const intent = await this.stripeService.stripe.paymentIntents.create({
            amount: course.priceInCents,
            currency: course.currency,
            metadata: {
                userId,
                type: PaymentType.COURSE,
                courseId: course.id,
            },
        });

        await this.persistPendingPayment({
            userId,
            type: PaymentType.COURSE,
            course,
            plan: null,
            intentId: intent.id,
            amountInCents: course.priceInCents,
            currency: course.currency,
        });

        return { clientSecret: this.requireClientSecret(intent) };
    }

    private async createSubscriptionIntent(
        userId: string,
        plan: SubscriptionPlan,
    ): Promise<{ clientSecret: string }> {
        const amountInCents = this.subscriptionsService.getPlanPriceInCents(plan);
        if (!amountInCents || amountInCents <= 0) {
            throw new BadRequestException(`El plan "${plan}" no es un plan pago.`);
        }
        if (await this.subscriptionsService.hasActiveSubscription(userId)) {
            throw new ConflictException('Ya tenés una suscripción activa');
        }

        const intent = await this.stripeService.stripe.paymentIntents.create({
            amount: amountInCents,
            currency: PLAN_CURRENCY,
            metadata: {
                userId,
                type: PaymentType.SUBSCRIPTION,
                planId: plan,
            },
        });

        await this.persistPendingPayment({
            userId,
            type: PaymentType.SUBSCRIPTION,
            course: null,
            plan,
            intentId: intent.id,
            amountInCents,
            currency: PLAN_CURRENCY,
        });

        return { clientSecret: this.requireClientSecret(intent) };
    }

    private persistPendingPayment(args: {
        userId: string;
        type: PaymentType;
        course: Course | null;
        plan: SubscriptionPlan | null;
        intentId: string;
        amountInCents: number;
        currency: string;
    }): Promise<Payment> {
        const payment = this.paymentsRepository.create({
            user: { id: args.userId } as User,
            type: args.type,
            course: args.course,
            plan: args.plan,
            stripePaymentIntentId: args.intentId,
            status: PaymentStatus.PENDING,
            amountInCents: args.amountInCents,
            currency: args.currency,
        });
        return this.paymentsRepository.save(payment);
    }

    private requireClientSecret(intent: Stripe.PaymentIntent): string {
        if (!intent.client_secret) {
            throw new InternalServerErrorException(
                'Stripe no devolvió client_secret para el PaymentIntent.',
            );
        }
        return intent.client_secret;
    }

    /**
     * Único lugar que confirma un pago. Lo llama el webhook cuando llega
     * `payment_intent.succeeded`.
     *
     * Idempotente por diseño (Stripe reintenta el webhook):
     *  - si no hay Payment local para ese intent → no hace nada
     *  - si el Payment ya está `succeeded` → no hace nada
     *  - crear enrollment / activar subscription son operaciones repetibles
     *
     * NO confía en `metadata`: valida el monto realmente capturado
     * (`amount_received`) contra la fila `Payment` antes de dar acceso.
     */
    async handlePaymentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
        const payment = await this.paymentsRepository.findOne({
            where: { stripePaymentIntentId: intent.id },
            relations: { user: true, course: true },
        });

        if (!payment) {
            this.logger.warn(
                `payment_intent.succeeded (${intent.id}) sin Payment local. Se ignora.`,
            );
            return;
        }
        if (payment.status === PaymentStatus.SUCCEEDED) {
            return; // ya procesado
        }

        const amountReceived = intent.amount_received ?? intent.amount;
        if (amountReceived !== payment.amountInCents) {
            this.logger.error(
                `Monto no coincide para ${intent.id}: Stripe=${amountReceived} ` +
                `local=${payment.amountInCents}. No se activa acceso.`,
            );
            payment.status = PaymentStatus.FAILED;
            await this.paymentsRepository.save(payment);
            return;
        }

        // Activar PRIMERO, marcar succeeded DESPUÉS: si la activación falla, el
        // Payment queda pending y Stripe reintenta el webhook.
        if (payment.type === PaymentType.COURSE) {
            await this.grantCourseAccess(payment);
        } else {
            await this.grantSubscriptionAccess(payment);
        }

        payment.status = PaymentStatus.SUCCEEDED;
        await this.paymentsRepository.save(payment);
    }

    private async grantCourseAccess(payment: Payment): Promise<void> {
        if (!payment.course) {
            throw new InternalServerErrorException(
                `Payment ${payment.id} es de tipo course pero no tiene curso asociado.`,
            );
        }
        try {
            await this.enrollmentsService.create(
                { courseId: payment.course.id },
                payment.user.id,
                { allowPaid: true },
            );
        } catch (error) {
            // Reintento del webhook después de que la inscripción ya se creó:
            // el estado final buscado ya existe, no es un error.
            if (error instanceof ConflictException) return;
            throw error;
        }
    }

    private async grantSubscriptionAccess(payment: Payment): Promise<void> {
        if (!payment.plan) {
            throw new InternalServerErrorException(
                `Payment ${payment.id} es de tipo subscription pero no tiene plan.`,
            );
        }
        // activateFromPayment ya es idempotente (si hay una ACTIVE, la devuelve).
        await this.subscriptionsService.activateFromPayment(
            payment.user.id,
            payment.plan,
            payment.amountInCents,
        );
    }
}
