import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    Index,
    JoinColumn,
} from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';

/**
 * Mensaje de un chat.
 *
 * `conversationId` reemplaza al viejo `receiverId`: los mensajes van a una
 * conversación (que hoy es siempre el chat grupal de un curso), no a una
 * persona. Quién puede verlos lo decide ChatParticipant, no el mensaje.
 *
 * `readAt` ya no existe: "leído" pasó a ser un estado POR PARTICIPANTE
 * (`ChatParticipant.lastReadAt`), no del mensaje. Si cada uno de los N
 * participantes leyó o no, no se puede guardar en el mensaje.
 */
@Entity('messages')
@Index('IDX_messages_conversation_created', ['conversationId', 'createdAt'])
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sender_id', type: 'uuid' })
    senderId: string;

    @Column({ name: 'conversation_id', type: 'uuid' })
    conversationId: string;

    @ManyToOne(() => ChatConversation, (c) => c.messages, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversation_id' }) 
    conversation: ChatConversation;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
