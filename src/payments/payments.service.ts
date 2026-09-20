import {
    Injectable,
    Logger,
    BadRequestException,
    ConflictException,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';

/** Respuesta de POST /payments/:intentId/sync. */
export interface PaymentSyncResult {
    /** Estado del Payment local DESPUÉS de sincronizar. */
    status: PaymentStatus;
    /** Estado del PaymentIntent según Stripe (ej. `succeeded`, `processing`). */
    stripeStatus: Stripe.PaymentIntent.Status | null;
}

/** Fila de GET /payments/me. */
export interface MyPaymentRow {
    id: string;
    /** Título del curso, "Suscripción Premium", o "Curso eliminado" si ya no existe. */
    concept: string;
    /** En centavos, igual que `amountInCents` — el front formatea. */
    amount: number;
    currency: string;
    status: PaymentStatus;
    date: Date;
}

/** Fila de GET /teacher/payments. */
export interface TeacherPaymentRow {
    id: string;
    courseName: string;
    buyerName: string;
    amount: number;
    currency: string;
    date: Date;
}
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payment, PaymentStatus, PaymentType } from './entities/payment.entity';
import { Course } from '../courses/entities/course.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { StripeService } from './stripe.service';
import { CreateIntentDto } from './dto/create-intent.dto';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import {
    SubscriptionsService,
    PLAN_CURRENCY,
} from '../subscriptions/subscriptions.service';
import { SubscriptionPlan } from '../subscriptions/entities/subscription.entity';

/** Estados de un PaymentIntent en los que todavía se puede pagar con su client_secret. */
const PAYABLE_INTENT_STATUSES: ReadonlySet<string> = new Set([
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
]);

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
        const course = await this.coursesRepository.findOne({
            where: { id: courseId },
            relations: { instructor: true },
        });
        if (!course) {
            throw new NotFoundException(`Curso con id ${courseId} no encontrado`);
        }
        if (course.priceInCents <= 0) {
            throw new BadRequestException('Este curso es gratis: no requiere pago.');
        }
        // Un docente ya tiene acceso a lo que dicta: cobrarle su propio curso
        // sería un error (y Stripe le cobraría de verdad).
        if (course.instructor?.id === userId) {
            throw new ConflictException('Este curso es tuyo: ya tenés acceso sin comprarlo.');
        }
        if (await this.enrollmentsService.hasActiveEnrollment(userId, courseId)) {
            throw new ConflictException('Ya estás inscripto en este curso');
        }

        const reusable = await this.reusePendingIntent(
            userId,
            { type: PaymentType.COURSE, courseId: course.id },
            course.priceInCents,
            course.currency,
        );
        if (reusable) return { clientSecret: reusable };

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

        const reusable = await this.reusePendingIntent(
            userId,
            { type: PaymentType.SUBSCRIPTION, plan },
            amountInCents,
            PLAN_CURRENCY,
        );
        if (reusable) return { clientSecret: reusable };

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

    /**
     * Client secret de un pago pendiente que sigue sirviendo para lo mismo, o
     * `null` si hay que crear uno nuevo.
     *
     * Abrir el checkout crea un PaymentIntent y una fila `pending`. Sin esto,
     * cada visita (recargar, volver atrás, abrirlo dos veces) dejaba una fila
     * más y el historial de pagos del alumno se llenaba de "Pendiente". Se
     * reutiliza el último pendiente del MISMO usuario, del MISMO curso o plan,
     * siempre que Stripe confirme que todavía se puede pagar y que el monto y
     * la moneda son los de hoy (si el precio cambió, ese intent ya no vale).
     *
     * Si Stripe falla al consultarlo, no se bloquea la compra: se crea uno
     * nuevo, que es lo que pasaba antes.
     */
    private async reusePendingIntent(
        userId: string,
        target: { type: PaymentType; courseId?: string; plan?: SubscriptionPlan },
        amountInCents: number,
        currency: string,
    ): Promise<string | null> {
        const where: FindOptionsWhere<Payment> = {
            user: { id: userId },
            type: target.type,
            status: PaymentStatus.PENDING,
        };
        if (target.courseId) where.course = { id: target.courseId };
        if (target.plan) where.plan = target.plan;

        const pending = await this.paymentsRepository.findOne({
            where,
            order: { createdAt: 'DESC' },
        });
        if (!pending) return null;

        try {
            const intent = await this.stripeService.stripe.paymentIntents.retrieve(
                pending.stripePaymentIntentId,
            );
            const isReusable =
                PAYABLE_INTENT_STATUSES.has(intent.status) &&
                intent.amount === amountInCents &&
                intent.currency.toLowerCase() === currency.toLowerCase() &&
                Boolean(intent.client_secret);

            return isReusable ? intent.client_secret : null;
        } catch (error) {
            this.logger.warn(
                `No se pudo reutilizar el PaymentIntent ${pending.stripePaymentIntentId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
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
     * Sincroniza un pago propio consultando a Stripe directamente. Lo llama el
     * front al volver del checkout (POST /payments/:intentId/sync).
     *
     * Existe porque el webhook no alcanza solo: en desarrollo Stripe no puede
     * llegar a `localhost`, y en producción un webhook puede demorarse o
     * fallar. Sin esto el usuario paga, Stripe cobra, y el acceso nunca se
     * activa. Con esto hay DOS caminos independientes a la misma activación:
     *
     *   - el webhook (Stripe → back), que cubre al que cierra la pestaña antes
     *     de volver;
     *   - este sync (front → back → Stripe), que cubre al que vuelve pero cuyo
     *     webhook no llegó.
     *
     * Es seguro porque el cliente no aporta ningún dato de verdad: sólo dice
     * qué intent mirar, y el estado lo obtiene el SERVIDOR preguntándole a
     * Stripe con la secret key. Después reusa handlePaymentSucceeded, que ya
     * es idempotente y valida el monto — si el webhook llega también, no
     * duplica nada.
     */
    async syncPayment(intentId: string, userId: string): Promise<PaymentSyncResult> {
        const payment = await this.paymentsRepository.findOne({
            where: { stripePaymentIntentId: intentId },
            relations: { user: true },
        });

        // Mismo 404 para "no existe" y "es de otro usuario": no le confirmamos
        // a nadie que un intent ajeno existe.
        if (!payment || payment.user.id !== userId) {
            throw new NotFoundException('Pago no encontrado');
        }

        if (payment.status !== PaymentStatus.PENDING) {
            return { status: payment.status, stripeStatus: null };
        }

        const intent = await this.stripeService.stripe.paymentIntents.retrieve(intentId);

        if (intent.status === 'succeeded') {
            await this.handlePaymentSucceeded(intent);

            const updated = await this.paymentsRepository.findOne({
                where: { id: payment.id },
            });
            return {
                status: updated?.status ?? payment.status,
                stripeStatus: intent.status,
            };
        }

        return { status: payment.status, stripeStatus: intent.status };
    }

    /**
     * Único lugar que confirma un pago. Lo llaman el webhook cuando llega
     * `payment_intent.succeeded` y syncPayment cuando el usuario vuelve del
     * checkout.
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

    /**
     * Historial de pagos del alumno: compras de curso y suscripciones juntas,
     * de la más nueva a la más vieja.
     *
     * El concepto se arma a partir de `type`, no de si `course` vino o no: un
     * pago de tipo COURSE cuyo curso se borró físicamente (rarísimo — el
     * borrado normal de un curso es lógico, ver CoursesService.remove) tiene
     * que decir "Curso eliminado", nunca confundirse con una suscripción.
     */
    async getMyPayments(userId: string): Promise<MyPaymentRow[]> {
        const payments = await this.paymentsRepository.find({
            where: { user: { id: userId } },
            relations: { course: true },
            order: { createdAt: 'DESC' },
        });

        return payments.map((payment) => ({
            id: payment.id,
            concept:
                payment.type === PaymentType.COURSE
                    ? (payment.course?.title ?? 'Curso eliminado')
                    : 'Suscripción Premium',
            amount: payment.amountInCents,
            currency: payment.currency,
            status: payment.status,
            date: payment.createdAt,
        }));
    }

    /**
     * Reporte de ventas para el docente (o el admin, sin filtrar por dueño).
     *
     * Sólo pagos SUCCEEDED: a diferencia de `getMyPayments`, esto es "plata
     * que entró", no un historial de intentos — un PaymentIntent pendiente o
     * fallido no es una venta.
     *
     * Las suscripciones (`course` null) quedan afuera a propósito: esa plata
     * es de la plataforma, ningún docente puntual la factura como propia.
     *
     * INNER JOIN contra `course`: en el flujo normal un pago COURSE siempre
     * tiene curso (el borrado de un curso es lógico, isActive:false — ver
     * CoursesService.remove), así que no hace falta LEFT JOIN. El único caso
     * en que desaparecería una venta de acá es un DELETE físico manual sobre
     * `courses`, que la app nunca hace.
     */
    async getTeacherPayments(
        actor: { id: string; role: UserRole },
    ): Promise<TeacherPaymentRow[]> {
        const query = this.paymentsRepository
            .createQueryBuilder('payment')
            .innerJoinAndSelect('payment.course', 'course')
            .innerJoinAndSelect('payment.user', 'buyer')
            .where('payment.type = :type', { type: PaymentType.COURSE })
            .andWhere('payment.status = :status', { status: PaymentStatus.SUCCEEDED })
            .orderBy('payment.createdAt', 'DESC');

        // El admin ve TODAS las ventas de curso, sin filtrar por instructor —
        // ni siquiera si el admin tiene cursos propios: acá es un reporte
        // global, no "mis ventas".
        if (actor.role !== UserRole.ADMIN) {
            query.andWhere('course.instructorId = :instructorId', {
                instructorId: actor.id,
            });
        }

        const payments = await query.getMany();

        return payments.map((payment) => ({
            id: payment.id,
            // No-null: lo garantiza el INNER JOIN de arriba.
            courseName: payment.course!.title,
            buyerName: payment.user?.name ?? 'Alumno',
            amount: payment.amountInCents,
            currency: payment.currency,
            date: payment.createdAt,
        }));
    }
}
