import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** Categoría del foro general del campus. La administra un ADMIN. */
@Entity('forum_categories')
export class ForumCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 80 })
    name: string;

    @Column({ type: 'varchar', length: 100, unique: true })
    slug: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'int', default: 0 })
    position: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
