import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateForumCategoryDto {
    @ApiProperty({ example: 'Presentaciones', maxLength: 80 })
    @IsString()
    @MinLength(2, { message: 'El nombre tiene que tener al menos 2 caracteres' })
    @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
    name: string;

    @ApiPropertyOptional({ maxLength: 300 })
    @IsOptional()
    @IsString()
    @MaxLength(300, { message: 'La descripción no puede superar los 300 caracteres' })
    description?: string;

    @ApiPropertyOptional({ default: 0 })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000)
    position?: number;
}

export class UpdateForumCategoryDto {
    @ApiPropertyOptional({ maxLength: 80 })
    @IsOptional()
    @IsString()
    @MinLength(2, { message: 'El nombre tiene que tener al menos 2 caracteres' })
    @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
    name?: string;

    @ApiPropertyOptional({ maxLength: 300 })
    @IsOptional()
    @IsString()
    @MaxLength(300, { message: 'La descripción no puede superar los 300 caracteres' })
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000)
    position?: number;

    @ApiPropertyOptional({ description: 'false oculta la categoría sin borrar sus hilos' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
