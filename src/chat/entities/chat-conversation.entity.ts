import {
    CreateDateColumn,
    Column,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

export enum ConversationType {
    COURSE = 'course',
    DIRECT = 'direct',
}

@Entity('chat_conversations')
export class ChatConversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    type: ConversationType;

    @Column({ name: 'course_id', type: 'uuid', nullable: true })
    courseId: string | null;

    @Column({ name: 'student_id', type: 'uuid', nullable: true })
    studentId: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
