import { ApiProperty } from '@nestjs/swagger';
import type { Quiz } from '../entities/quiz.entity';
import type { Question } from '../entities/question.entity';
import type { Option } from '../entities/option.entity';

/**
 * Lo que ve el ALUMNO de un quiz. NUNCA trae `isCorrect`: la corrección es
 * server-side.
 *
 * Los mappers copian campo a campo (whitelist) en vez de hacer spread de la
 * entidad: si mañana se agrega una columna a Option, no se filtra sola.
 */

/** Una pregunta con sus opciones ya cargadas (Question no tiene la relación inversa). */
export type QuestionWithOptions = Question & { options: Option[] };

export class StudentQuizOptionDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    text: string;
}

export class StudentQuizQuestionDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    text: string;

    @ApiProperty({ type: [StudentQuizOptionDto] })
    options: StudentQuizOptionDto[];
}

export class StudentQuizDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    courseId: string;

    @ApiProperty({ nullable: true, type: String, description: 'null = checkpoint de fin de curso' })
    moduleId: string | null;

    @ApiProperty({ nullable: true, type: Number, description: 'Orden del módulo; null en fin de curso' })
    moduleOrder: number | null;

    @ApiProperty()
    title: string;

    @ApiProperty({ example: 70 })
    passingScore: number;

    @ApiProperty({ type: [StudentQuizQuestionDto] })
    questions: StudentQuizQuestionDto[];

    static from(quiz: Quiz, questions: QuestionWithOptions[]): StudentQuizDto {
        return {
            id: quiz.id,
            courseId: quiz.courseId,
            moduleId: quiz.moduleId,
            moduleOrder: quiz.module?.order ?? null,
            title: quiz.title,
            passingScore: quiz.passingScore,
            questions: questions.map((question) => ({
                id: question.id,
                text: question.text,
                options: question.options.map((option) => ({
                    id: option.id,
                    text: option.text,
                })),
            })),
        };
    }
}
