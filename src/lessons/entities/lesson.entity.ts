import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { CourseModule } from '../../course-modules/entities/course-module.entity';
import { LessonProgress } from '../../lesson-progress/entities/lesson-progress.entity';

@Entity('lessons')
export class Lesson {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column({ type: 'text', nullable: true })
    content: string;

    @Column({ name: 'video_url', nullable: true })
    videoUrl: string;

    @Column({ name: 'order_index' })
    order: number;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => CourseModule, (module) => module.lessons, { onDelete: 'CASCADE' })
    module: CourseModule;

    @OneToMany(() => LessonProgress, (progress) => progress.lesson)
    progressRecords: LessonProgress[];
}