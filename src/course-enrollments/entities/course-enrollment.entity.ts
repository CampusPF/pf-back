import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Course } from '../../courses/entities/course.entity';
import { LessonProgress } from '../../lesson-progress/entities/lesson-progress.entity';

@Entity('course_enrollments')
@Unique(['student', 'course'])
export class CourseEnrollment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, (user) => user.enrollments, { onDelete: 'CASCADE' })
    student: User;

    @ManyToOne(() => Course, (course) => course.enrollments, { onDelete: 'CASCADE' })
    course: Course;

    @Column({ name: 'progress_percent', default: 0 })
    progressPercent: number;

    @Column({ default: true })
    isActive: boolean;

    @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
    completedAt: Date;

    @OneToMany(() => LessonProgress, (progress) => progress.enrollment)
    lessonProgress: LessonProgress[];

    @CreateDateColumn({ name: 'enrolled_at' })
    enrolledAt: Date;
}