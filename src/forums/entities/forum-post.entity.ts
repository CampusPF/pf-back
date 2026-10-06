import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ForumThread } from './forum-thread.entity';

/** Respuesta dentro de un hilo. El borrado es físico: se descuenta de replyCount. */
@Entity('forum_posts')
@Index('IDX_forum_posts_thread_created', ['threadId', 'createdAt'])
export class ForumPost {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'thread_id', type: 'uuid' })
    threadId: string;

    @ManyToOne(() => ForumThread, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'thread_id' })
    thread: ForumThread;

    @Column({ name: 'author_id', type: 'uuid' })
    authorId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'author_id' })
    author: User;

    @Column({ type: 'text' })
    body: string;

    @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
    editedAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
