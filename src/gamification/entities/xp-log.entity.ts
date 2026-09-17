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
 * Un movimiento de XP por fila. El total de un usuario es un SUM sobre esta
 * tabla, no un contador guardado en users (misma razón que la racha).
 */
@Entity('xp_log')
// Acelera la suma de XP por usuario.
@Index('IDX_xp_log_user', ['userId'])
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
