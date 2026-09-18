import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Index,
    Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Un movimiento de XP por fila. El total de un usuario es un SUM sobre esta
 * tabla, no un contador guardado en users (misma razón que la racha).
 */
@Entity('xp_log')
// Acelera la suma de XP por usuario.
@Index('IDX_xp_log_user', ['userId'])
/* Un hecho suma XP UNA sola vez. `reason` es "<acción>:<id>"
   ("lesson_completed:<lessonId>"), así que este único es lo que hace
   idempotente a XpService.addXp: LESSON_COMPLETED se vuelve a emitir si el
   alumno desmarca y re-marca una lección, y sin esto cada pasada duplicaría
   el XP. */
@Unique('UQ_xp_log_user_reason', ['userId', 'reason'])
export class XpLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ type: 'int' })
    amount: number;

    /** Ej: "lesson_completed:<lessonId>", "quiz_passed:<quizId>", "course_completed:<courseId>". */
    @Column({ type: 'varchar', length: 255 })
    reason: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
