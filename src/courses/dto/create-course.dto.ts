import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsUUID,
    MaxLength,
    IsUrl,
    IsEnum,
    IsInt,
    Min,
    Length,
} from 'class-validator';
import { CourseDifficulty } from '../entities/course.entity';

export class CreateCourseDto {
    @ApiProperty({ example: 'Introducción a NestJS', description: 'Título del curso' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    title: string;

    @ApiPropertyOptional({
        example: 'Curso práctico para construir APIs REST con NestJS y TypeORM.',
        description: 'Descripción del curso',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        enum: CourseDifficulty,
        example: CourseDifficulty.BEGINNER,
        description: 'Nivel de dificultad del curso',
        default: CourseDifficulty.BEGINNER,
    })
    @IsOptional()
    @IsEnum(CourseDifficulty)
    difficulty?: CourseDifficulty;

    @ApiPropertyOptional({
        example: 'https://cdn.campuslite.com/covers/curso-nestjs.png',
        description: 'URL de la imagen de portada',
    })
    // TODO(seguridad): hoy la portada llega como URL ya subida en otro lado.
    // No hay ningún endpoint de upload en esta API. Si se agrega uno (p. ej.
    // Cloudinary), tiene que: validar mimetype y tamaño con el fileFilter y
    // limits.fileSize de Multer ANTES de subir (rechazar con 400 lo que no
    // sea imagen), firmar la subida en el backend con el api_secret leído de
    // env (nada de upload presets unsigned) y no devolver nunca el api_secret
    // al front.
    @IsOptional()
    @IsUrl()
    imageUrl?: string;

    @ApiProperty({
        example: '8a01e21a-a392-4e93-bf76-8d1f4a4ef650',
        description: 'ID de la categoría a la que pertenece el curso',
    })
    @IsUUID()
    @IsNotEmpty()
    categoryId: string;

    @ApiPropertyOptional({
        example: 4999,
        description:
            'Precio en la unidad mínima de la moneda (centavos para usd). 0 = curso gratis.',
        default: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    priceInCents?: number;

    @ApiPropertyOptional({
        example: 'usd',
        description: 'Moneda ISO-4217 en minúsculas (la que espera Stripe).',
        default: 'usd',
    })
    @IsOptional()
    @IsString()
    @Length(3, 3)
    currency?: string;
}