import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Campos de texto del multipart (el audio va aparte, en el campo `audio`). */
export class TranscribeAudioDto {
    @ApiPropertyOptional({
        description: 'Contexto para mejorar la precisión (ej. título de la lección). No es una instrucción.',
        example: 'Repositorios y consultas básicas',
        maxLength: 200,
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    context?: string;
}
