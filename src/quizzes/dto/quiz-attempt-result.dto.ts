import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QuizAttemptDetailDto {
    @ApiProperty()
    questionId: string;

    @ApiProperty()
    questionText: string;

    @ApiProperty()
    correct: boolean;

    @ApiProperty({ example: 'Sin responder' })
    selectedOptionText: string;

    @ApiPropertyOptional({ description: 'Sólo viene si el intento aprobó' })
    correctOptionText?: string;
}

/**
 * El intento ya corregido. Se arma en el service: la tabla quiz_attempt sólo
 * guarda answers / score / passed.
 */
export class QuizAttemptResultDto {
    @ApiProperty({ example: 67, description: '0-100, redondeado' })
    score: number;

    @ApiProperty()
    passed: boolean;

    @ApiProperty({ example: 70 })
    passingScore: number;

    @ApiProperty({ example: 2 })
    correctCount: number;

    @ApiProperty({ example: 3 })
    totalQuestions: number;

    @ApiProperty({ type: [QuizAttemptDetailDto] })
    details: QuizAttemptDetailDto[];
}
