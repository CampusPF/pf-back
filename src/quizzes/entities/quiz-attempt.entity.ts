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
import { Quiz } from './quiz.entity';

@Entity('quiz_attempt')
// Acelera hasPassedAllQuizzes(userId, courseId).
@Index('IDX_quiz_attempt_user_quiz', ['userId', 'quizId'])
export class QuizAttempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'quiz_id', type: 'uuid' })
    quizId: string;

    @ManyToOne(() => Quiz, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'quiz_id' })
    quiz: Quiz;

    /** Snapshot de lo respondido: [{ questionId, optionId }]. */
    @Column({ type: 'jsonb' })
    answers: Record<string, unknown>;

    /** Porcentaje 0-100. */
    @Column({ type: 'int' })
    score: number;

    @Column({ type: 'boolean' })
    passed: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
