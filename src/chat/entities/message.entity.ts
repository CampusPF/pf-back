import {
    CreateDateColumn,
    Column,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('messages')
@Index('IDX_messages_conversation_created', ['conversationId', 'createdAt'])
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'conversation_id', type: 'uuid' })
    conversationId: string;

    @Column({ name: 'sender_id', type: 'uuid' })
    senderId: string;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
