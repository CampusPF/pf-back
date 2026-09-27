import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';
import { ChatParticipant } from './chat-participant.entity';
import { Message } from './message.entity';

/**
 * Una conversación de chat. Hay 2 tipos:
 *
 *  - 'course': la sala grupal del curso. Participantes: el profesor dueño +
 *    todos los alumnos inscriptos activos.
 *  - 'direct': chat privado alumno ↔ profesor. Participantes: 2 (el profesor
 *    + 1 alumno).
 *
 * Un mismo curso tiene: 1 chat 'course' + 1 chat 'direct' por cada alumno.
 */
@Entity('chat_conversations')
export class ChatConversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 20 })
    type: 'course' | 'direct';

    // El curso al que pertenece el chat. Obligatorio en 'course', nullable en 'direct'.
    @Column({ name: 'course_id', type: 'uuid', nullable: true })
    courseId: string | null;

    @ManyToOne(() => Course, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'course_id' })
    course: Course | null;

    // Sólo en 'direct': el alumno del otro lado del profesor.
    @Column({ name: 'student_id', type: 'uuid', nullable: true })
    studentId: string | null;

    @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'student_id' })
    student: User | null;

    @OneToMany(() => ChatParticipant, (p) => p.conversation)
    participants: ChatParticipant[];

    @OneToMany(() => Message, (m) => m.conversation)
    messages: Message[];

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
