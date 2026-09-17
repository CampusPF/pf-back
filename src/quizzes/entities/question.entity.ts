import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Quiz } from './quiz.entity';

@Entity('question')
// "Las preguntas de un quiz" es LA lectura de esta tabla.
@Index('IDX_question_quiz', ['quizId'])
export class Question {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'quiz_id', type: 'uuid' })
    quizId: string;

    @ManyToOne(() => Quiz, (quiz) => quiz.questions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'quiz_id' })
    quiz: Quiz;

    @Column({ type: 'text' })
    text: string;

    // `order` es palabra reservada en SQL: misma convención que Lesson y
    // CourseModule.
    @Column({ name: 'order_index', type: 'int', default: 0 })
    order: number;
}
