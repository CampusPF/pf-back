import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Question } from './question.entity';

@Entity('option')
// "Las opciones de una pregunta" es LA lectura de esta tabla.
@Index('IDX_option_question', ['questionId'])
export class Option {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'question_id', type: 'uuid' })
    questionId: string;

    @ManyToOne(() => Question, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'question_id' })
    question: Question;

    @Column({ type: 'text' })
    text: string;

    /**
     * Nunca se devuelve en el GET del quiz: la corrección se hace en el
     * servidor, con un DTO de salida que no incluya este campo.
     */
    @Column({ name: 'is_correct', type: 'boolean', default: false })
    isCorrect: boolean;
}
