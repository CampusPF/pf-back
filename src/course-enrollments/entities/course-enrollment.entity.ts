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

    /* DERIVADO: lo recalcula el back en
       LessonProgressService.recalculateEnrollmentProgress cada vez que se
       marca, desmarca o borra una lección. Ningún cliente lo escribe. */
    @Column({ name: 'progress_percent', default: 0 })
    progressPercent: number;

    @Column({ default: true })
    isActive: boolean;

    /* `Date | null` y no `Date`: la columna es nullable y el recálculo la
       vuelve a poner en null si el avance baja de 100 (una lección desmarcada,
       o una lección nueva agregada al curso). El tipo decía que nunca podía
       ser null y la base decía lo contrario. */
    @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
    completedAt: Date | null;

    @OneToMany(() => LessonProgress, (progress) => progress.enrollment)
    lessonProgress: LessonProgress[];

    @CreateDateColumn({ name: 'enrolled_at' })
    enrolledAt: Date;
}