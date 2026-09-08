import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';

@Entity('course_modules')
export class CourseModule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column({ name: 'order_index' })
    order: number;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => Course, (course) => course.modules, { onDelete: 'CASCADE' })
    course: Course;

    @OneToMany(() => Lesson, (lesson) => lesson.module)
    lessons: Lesson[];
}