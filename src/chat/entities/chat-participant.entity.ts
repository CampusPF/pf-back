import {
    CreateDateColumn,
    Column,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('chat_participants')
export class ChatParticipant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'conversation_id', type: 'uuid' })
    conversationId: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
    lastReadAt: Date | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
