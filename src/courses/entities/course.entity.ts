import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { CourseModule } from '../../course-modules/entities/course-module.entity';
import { CourseEnrollment } from '../../course-enrollments/entities/course-enrollment.entity';

export enum CourseDifficulty {
    BEGINNER = 'beginner',
    INTERMEDIATE = 'intermediate',
    ADVANCED = 'advanced',
}

@Entity('courses')
export class Course {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'enum', enum: CourseDifficulty, default: CourseDifficulty.BEGINNER })
    difficulty: CourseDifficulty;

    @Column({ name: 'image_url', nullable: true })
    imageUrl: string;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => User, (user) => user.coursesCreated, { onDelete: 'CASCADE' })
    instructor: User;

    @ManyToOne(() => Category, (category) => category.courses, { nullable: true, onDelete: 'SET NULL' })
    category: Category;

    @OneToMany(() => CourseModule, (module) => module.course)
    modules: CourseModule[];

    @OneToMany(() => CourseEnrollment, (enrollment) => enrollment.course)
    enrollments: CourseEnrollment[];

    @CreateDateColumn()
    createdAt: Date;
}