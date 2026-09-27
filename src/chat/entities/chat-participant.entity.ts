import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    Index,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ChatConversation } from './chat-conversation.entity';

/**
 * Un participante de un chat: el profesor dueño del curso o un alumno.
 *
 * `lastReadAt` es por participante, no por mensaje: cada uno tiene su propio
 * "último mensaje que leí". Los no leídos de una conversación se calculan
 * contando los mensajes con `createdAt > lastReadAt` que no mandé yo.
 *
 * `isActive` permite que un alumno desinscripto siga viendo el historial
 * pero no pueda mandar mensajes nuevos: la regla se aplica en ChatService,
 * no se borra la fila (así el historial y las lecturas se conservan).
 */
@Entity('chat_participants')
@Index('IDX_chat_participants_conversation_user', ['conversationId', 'userId'], { unique: true })
@Index('IDX_chat_participants_user', ['userId'])
export class ChatParticipant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'conversation_id', type: 'uuid' })
    conversationId: string;

    @ManyToOne(() => ChatConversation, (c) => c.participants, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversation_id' }) 
    conversation: ChatConversation;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    /** Última vez que este usuario abrió la conversación. Null = nunca leyó nada. */
    @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
    lastReadAt: Date | null;

    /**
     * false cuando el alumno se desinscribió del curso.
     * Sigue viendo el historial, pero no puede mandar mensajes nuevos.
     */
    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
