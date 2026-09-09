import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { CourseModule } from '../../course-modules/entities/course-module.entity';
import { LessonProgress } from '../../lesson-progress/entities/lesson-progress.entity';

@Entity('lessons')
export class Lesson {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    // select:false → NINGUNA query trae estas dos columnas por defecto
    // (listados, sidebar, lesson-progress, aiTutor...). El único lugar que las
    // vuelve a pedir explícitamente es LessonsService.findOne (vía addSelect),
    // y ahí LessonsController decide si las devuelve o las anula según el
    // acceso del usuario al curso.
    @Column({ type: 'text', nullable: true, select: false })
    content: string;

    @Column({ name: 'video_url', nullable: true, select: false })
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