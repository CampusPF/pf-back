import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const REVIEW_COMMENT_MAX_LENGTH = 1000;

export class UpsertCourseReviewDto {
    @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Puntaje de 1 a 5 estrellas' })
    @IsInt({ message: 'La valoración tiene que ser un número entero' })
    @Min(1, { message: 'La valoración mínima es 1' })
    @Max(5, { message: 'La valoración máxima es 5' })
    rating: number;

    @ApiPropertyOptional({
        example: 'Muy claro, los proyectos del final valen la pena.',
        maxLength: REVIEW_COMMENT_MAX_LENGTH,
        description: 'Comentario opcional. Vacío o ausente = sólo puntaje.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(REVIEW_COMMENT_MAX_LENGTH, {
        message: `El comentario no puede superar los ${REVIEW_COMMENT_MAX_LENGTH} caracteres`,
    })
    comment?: string;
}
