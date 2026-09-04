import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';
import { Message } from './message.entity';

@Entity('ai_tutor_conversations')
export class Conversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    student: User;

    @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
    lesson: Lesson;

    @OneToMany(() => Message, (message) => message.conversation, { cascade: true })
    messages: Message[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}