import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Una sola tabla para dos cosas: lo que el usuario ve en la campanita del
 * navbar (channel 'in_app') y el registro de qué mail ya se mandó (channel
 * 'email'). `both` es una notificación que se muestra y además se manda.
 */
@Entity('notification')
// La campanita: "mis no leídas".
@Index('IDX_notification_user_read', ['userId', 'read'])
// El listado: "mis notificaciones, de la más nueva a la más vieja".
@Index('IDX_notification_user_created', ['userId', 'createdAt'])
/* Evita duplicados (ej. que un cron mande dos veces el mismo recordatorio).
   Parcial: las notificaciones sin dedupeKey no compiten entre sí. El WHERE va
   con el nombre REAL de la columna en la base, no el de la propiedad. */
@Index('UQ_notification_user_dedupe', ['userId', 'dedupeKey'], {
    unique: true,
    where: '"dedupe_key" IS NOT NULL',
})
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    /**
     * Ej: 'welcome', 'course_enrolled', 'course_completed',
     * 'certificate_issued', 'checkpoint_passed', 'weekly_reminder',
     * 'password_changed'. Varchar y no enum de Postgres a propósito: van a
     * salir tipos nuevos seguido y un enum obliga a un ALTER TYPE cada vez.
     */
    @Column({ type: 'varchar', length: 50 })
    type: string;

    /** 'in_app' | 'email' | 'both' */
    @Column({ type: 'varchar', length: 20, default: 'in_app' })
    channel: string;

    @Column({ type: 'varchar', length: 150 })
    title: string;

    @Column({ type: 'text' })
    message: string;

    /** Ruta a la que navega el front al clickear, ej "/certificados/verificar/CMP-8F3K2A". */
    @Column({ type: 'varchar', length: 255, nullable: true })
    link: string | null;

    /**
     * Clave que arma quien EMITE la notificación para evitar duplicados, ej:
     * "weekly-reminder-<courseId>-2026-W38" o "course-completed-<courseId>".
     * Null si ese tipo de notificación no necesita dedupe.
     */
    @Column({ name: 'dedupe_key', type: 'varchar', length: 255, nullable: true })
    dedupeKey: string | null;

    @Column({ type: 'boolean', default: false })
    read: boolean;

    @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
    readAt: Date | null;

    /**
     * Cuándo se mandó efectivamente el mail (channel 'email' o 'both'). Null
     * mientras está pendiente, y siempre null si channel es 'in_app'.
     */
    @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
    sentAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
