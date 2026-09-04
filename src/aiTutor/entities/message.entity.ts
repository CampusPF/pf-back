import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
}

@Entity('ai_tutor_messages')
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
        onDelete: 'CASCADE',
    })
    conversation: Conversation;

    @Column({ type: 'enum', enum: MessageRole })
    role: MessageRole;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}