import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    OneToMany,
    Index,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { CourseModule } from '../../course-modules/entities/course-module.entity';
import { Question } from './question.entity';

/** Checkpoint: de un módulo puntual, o de fin de curso si `moduleId` es null. */
@Entity('quiz')
// Postgres no indexa las FKs solo: "los quizzes de un curso" y el borrado en
// cascada de un curso harían un scan completo sin esto.
@Index('IDX_quiz_course', ['courseId'])
export class Quiz {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'course_id', type: 'uuid' })
    courseId: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'course_id' })
    course: Course;

    /** null = checkpoint de fin de curso, no de un módulo puntual. */
    @Column({ name: 'module_id', type: 'uuid', nullable: true })
    moduleId: string | null;

    @ManyToOne(() => CourseModule, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'module_id' })
    module: CourseModule | null;

    @Column({ type: 'varchar', length: 150 })
    title: string;

    /** Porcentaje mínimo (0-100) para aprobar. */
    @Column({ name: 'passing_score', type: 'int', default: 70 })
    passingScore: number;

    @OneToMany(() => Question, (question) => question.quiz)
    questions: Question[];
}
