// categories/entities/category.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Course } from '../../courses/entities/course.entity';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column({ nullable: true })
    description?: string;

    @Column({ nullable: true })
    imageUrl?: string;

    // public_id de Cloudinary, para poder borrar la imagen vieja al reemplazarla.
    // Null si imageUrl apunta a una URL externa.
    @Column({ nullable: true })
    imagePublicId?: string;

    @Column({ nullable: true })
    color?: string;

    @Column({ nullable: true })
    icon?: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updatedAt: Date;

    @OneToMany(() => Course, (course) => course.category)
    courses: Course[];
}