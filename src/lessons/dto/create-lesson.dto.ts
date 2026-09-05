import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsUUID,
    IsUrl,
    IsInt,
    Min,
    MaxLength,
    IsIn,
} from 'class-validator';

export class CreateLessonDto {
    @ApiProperty({ example: 'Instalando NestJS CLI', description: 'Título de la lección' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    title: string;

    @ApiProperty({
        example: '497199a9-0881-40b5-a11c-30a4b61cc6b3',
        description: 'ID del módulo al que pertenece la lección',
    })
    @IsUUID()
    @IsNotEmpty()
    moduleId: string;

    @ApiPropertyOptional({
        example: 'https://cdn.miapp.com/videos/leccion-1.mp4',
        description: 'URL del video de la lección',
    })
    @IsOptional()
    @IsUrl()
    videoUrl?: string;

    @ApiPropertyOptional({
        example: 'En esta lección instalaremos el CLI de NestJS y crearemos el primer proyecto...',
        description: 'Contenido textual o descripción de la lección',
    })
    @IsOptional()
    @IsString()
    content?: string;

    @ApiPropertyOptional({
        example: 'video',
        enum: ['video', 'text', 'quiz'],
        description: 'Tipo de contenido de la lección',
        default: 'video',
    })
    @IsOptional()
    @IsIn(['video', 'text', 'quiz'])
    type?: string;

    @ApiPropertyOptional({
        example: 1,
        description: 'Orden de la lección dentro del módulo',
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    order?: number;

    @ApiPropertyOptional({
        example: 300,
        description: 'Duración estimada de la lección en segundos',
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    durationInSeconds?: number;
}