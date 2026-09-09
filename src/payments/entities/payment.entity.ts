import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Course } from '../../courses/entities/course.entity';
import { SubscriptionPlan } from '../../subscriptions/entities/subscription.entity';

export enum PaymentType {
    COURSE = 'course',
    SUBSCRIPTION = 'subscription',
}

export enum PaymentStatus {
    PENDING = 'pending',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed',
}

/**
 * Registro de una intención de cobro de Stripe.
 *
 * Se crea SIEMPRE en estado `pending` cuando el front pide un PaymentIntent
 * (POST /payments/create-intent). El único lugar que lo pasa a `succeeded` es
 * el webhook de Stripe (payment_intent.succeeded), y esa fila es también lo
 * que da acceso: la CourseEnrollment / Subscription se crea recién ahí.
 *
 * `stripePaymentIntentId` es UNIQUE: es la clave de idempotencia. Stripe
 * reintenta el webhook si no le devolvés 200 rápido, así que el handler tiene
 * que poder correr N veces sobre el mismo id sin duplicar nada.
 */
@Entity('payments')
export class Payment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
    user: User;

    @Column({ type: 'enum', enum: PaymentType })
    type: PaymentType;

    // Presente solo cuando type === 'course'. onDelete: 'SET NULL' a propósito:
    // un pago es un registro financiero, no se borra si después se elimina el
    // curso.
    @ManyToOne(() => Course, { onDelete: 'SET NULL', nullable: true })
    course: Course | null;

    // Presente solo cuando type === 'subscription'.
    @Column({ type: 'enum', enum: SubscriptionPlan, nullable: true })
    plan: SubscriptionPlan | null;

    @Index({ unique: true })
    @Column({ name: 'stripe_payment_intent_id', type: 'varchar' })
    stripePaymentIntentId: string;

    @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
    status: PaymentStatus;

    @Column({ name: 'amount_in_cents', type: 'int' })
    amountInCents: number;

    @Column({ type: 'varchar', length: 3, default: 'usd' })
    currency: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
