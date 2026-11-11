import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';
import type { GolondrinaAction, GolondrinaChannel, GolondrinaStatus } from '../golondrina.actions';

/**
 * Una automatización que el alumno activó desde el asistente de una lección:
 * «recordame repasar», «armá mi plan», «mandame el resumen», «avisame si
 * responde el docente».
 *
 * Una fila por (alumno, lección, acción): volver a tocar la acción la
 * reactiva y la reprograma en vez de duplicarla.
 *
 * action/channel/status son varchar y no enums de Postgres a propósito, igual
 * que `notification.type`: sumar una acción no debería exigir un ALTER TYPE.
 */
@Entity('golondrina_automations')
@Unique('UQ_golondrina_user_lesson_action', ['userId', 'lessonId', 'action'])
// El runner: «las activas que ya tocan».
@Index('IDX_golondrina_status_next_run', ['status', 'nextRunAt'])
export class GolondrinaAutomation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'lesson_id', type: 'uuid' })
    lessonId: string;

    @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'lesson_id' })
    lesson: Lesson;

    @Column({ type: 'varchar', length: 20 })
    action: GolondrinaAction;

    @Column({ type: 'varchar', length: 10 })
    channel: GolondrinaChannel;

    @Column({ type: 'varchar', length: 12, default: 'active' })
    status: GolondrinaStatus;

    /** Próxima corrida. Null: la dispara un evento (acción «docente») o ya terminó. */
    @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
    nextRunAt: Date | null;

    /** Corridas que faltan. 0 en «docente», que no se agota. */
    @Column({ name: 'runs_left', type: 'int', default: 0 })
    runsLeft: number;

    /** Cuántas veces salió. El plan la usa para saber qué bloque toca. */
    @Column({ name: 'runs_done', type: 'int', default: 0 })
    runsDone: number;

    @Column({ name: 'last_sent_at', type: 'timestamptz', nullable: true })
    lastSentAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
