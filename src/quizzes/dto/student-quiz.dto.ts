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

    @ApiProperty({ description: 'Cuántas veces se puede rendir en total' })
    maxAttempts: number;

    @ApiProperty({ description: 'Intentos que le quedan al alumno antes de agotarlo' })
    attemptsLeft: number;

    @ApiProperty({ description: 'Ya lo aprobó. Puede verlo, pero no volver a rendirlo.' })
    passed: boolean;

    @ApiProperty({
        description:
            'Puede rendirlo ahora. false si ya lo aprobó o si agotó los intentos: la UI no debe ofrecer empezar.',
    })
    canAttempt: boolean;

    @ApiProperty({ type: [StudentQuizQuestionDto] })
    questions: StudentQuizQuestionDto[];

    static from(
        quiz: Quiz,
        questions: QuestionWithOptions[],
        attempts: { maxAttempts: number; attemptsLeft: number; passed: boolean },
    ): StudentQuizDto {
        return {
            id: quiz.id,
            courseId: quiz.courseId,
            moduleId: quiz.moduleId,
            moduleOrder: quiz.module?.order ?? null,
            title: quiz.title,
            passingScore: quiz.passingScore,
            maxAttempts: attempts.maxAttempts,
            attemptsLeft: attempts.attemptsLeft,
            passed: attempts.passed,
            // Aprobado es estado final: no se vuelve a rendir aunque sobren
            // intentos. Y sin intentos tampoco, hasta que el docente habilite.
            canAttempt: !attempts.passed && attempts.attemptsLeft > 0,
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
