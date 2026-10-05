import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsUUID,
    MaxLength,
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
        example: 'react-avanzado-con-typescript',
        description:
            'Slug para URLs. Opcional: si no viene se deriva del título. Se ' +
            'slugifica igual y, si choca con otro, se le agrega un sufijo numérico.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(160)
    slug?: string;

    @ApiPropertyOptional({
        enum: CourseDifficulty,
        example: CourseDifficulty.BEGINNER,
        description: 'Nivel de dificultad del curso',
        default: CourseDifficulty.BEGINNER,
    })
    @IsOptional()
    @IsEnum(CourseDifficulty)
    difficulty?: CourseDifficulty;

    /* La portada NO se manda como URL. Se sube con POST /courses/:id/image
       (Multer valida mimetype y tamaño antes de subir, y la firma la hace el
       back con el api_secret de env). Aceptar una URL arbitraria acá dejaba
       que cualquier docente publicara en el catálogo una imagen alojada en
       otro lado, y además el PATCH pisaba `imageUrl` sin tocar
       `imagePublicId`: la anterior quedaba huérfana en Cloudinary para
       siempre. El front ya no manda este campo desde que existe el uploader. */

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