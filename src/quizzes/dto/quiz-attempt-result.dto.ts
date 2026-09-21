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

    /**
     * Intentos que quedan DESPUÉS de éste, ya descontado.
     *
     * Viaja en la respuesta y no lo calcula el front restando uno: la pantalla
     * del quiz se carga una sola vez, y al segundo intento su número local ya
     * estaba viejo — seguía ofreciendo "volver a intentar" con los intentos
     * agotados.
     */
    @ApiProperty({ example: 1 })
    attemptsLeft: number;

    @ApiProperty({ type: [QuizAttemptDetailDto] })
    details: QuizAttemptDetailDto[];
}
