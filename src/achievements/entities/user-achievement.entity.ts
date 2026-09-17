import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Achievement } from './achievement.entity';

@Entity('user_achievement')
// Un logro se desbloquea una sola vez por usuario.
@Unique('UQ_user_achievement_user_achievement', ['userId', 'achievementId'])
export class UserAchievement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'achievement_id', type: 'uuid' })
    achievementId: string;

    @ManyToOne(() => Achievement, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'achievement_id' })
    achievement: Achievement;

    @CreateDateColumn({ name: 'unlocked_at', type: 'timestamptz' })
    unlockedAt: Date;
}
