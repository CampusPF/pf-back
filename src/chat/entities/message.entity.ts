import {
    CreateDateColumn,
    Column,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('messages')
@Index('IDX_messages_sender_receiver_created', ['senderId', 'receiverId', 'createdAt'])
@Index('IDX_messages_receiver_read_at', ['receiverId', 'readAt'])
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sender_id', type: 'uuid' })
    senderId: string;

    @Column({ name: 'receiver_id', type: 'uuid' })
    receiverId: string;

    @Column({ type: 'text' })
    content: string;

    @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
    readAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
