import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
    Check,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Course } from '../../courses/entities/course.entity';
import { ForumCategory } from './forum-category.entity';

/**
 * Hilo de discusión. Vive en el foro de un curso (courseId) o en una
 * categoría del foro general (categoryId), nunca en las dos ni en ninguna.
 * El borrado es lógico (deletedAt) para no perder el hilo si un moderador se
 * arrepiente.
 */
@Entity('forum_threads')
@Check('CHK_forum_threads_scope', '("course_id" IS NULL) <> ("category_id" IS NULL)')
@Index('IDX_forum_threads_course_activity', ['courseId', 'isPinned', 'lastActivityAt'])
@Index('IDX_forum_threads_category_activity', ['categoryId', 'isPinned', 'lastActivityAt'])
export class ForumThread {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'course_id', type: 'uuid', nullable: true })
    courseId: string | null;

    @ManyToOne(() => Course, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'course_id' })
    course: Course | null;

    @Column({ name: 'category_id', type: 'uuid', nullable: true })
    categoryId: string | null;

    @ManyToOne(() => ForumCategory, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'category_id' })
    category: ForumCategory | null;

    @Column({ name: 'author_id', type: 'uuid' })
    authorId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'author_id' })
    author: User;

    @Column({ type: 'varchar', length: 150 })
    title: string;

    @Column({ type: 'text' })
    body: string;

    @Column({ name: 'is_pinned', default: false })
    isPinned: boolean;

    /** Cerrado: no admite respuestas nuevas salvo de moderadores. */
    @Column({ name: 'is_locked', default: false })
    isLocked: boolean;

    /** FK a forum_posts (ON DELETE SET NULL, ver la migración). */
    @Column({ name: 'solution_post_id', type: 'uuid', nullable: true })
    solutionPostId: string | null;

    @Column({ name: 'reply_count', type: 'int', default: 0 })
    replyCount: number;

    @Column({ name: 'last_activity_at', type: 'timestamptz' })
    lastActivityAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
