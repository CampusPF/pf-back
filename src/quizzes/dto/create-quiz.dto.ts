import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { CreateQuestionDto } from './create-question.dto';

export class CreateQuizDto {
    @ApiProperty({ example: 'b3f1c2a0-1234-4a5b-9abc-1234567890ab' })
    @IsUUID()
    @IsNotEmpty()
    courseId: string;

    @ApiPropertyOptional({
        example: 'c4a2d3b1-1234-4a5b-9abc-1234567890ab',
        nullable: true,
        description: 'Módulo del checkpoint. null u omitido = checkpoint de fin de curso.',
    })
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsUUID()
    moduleId?: string | null;

    @ApiProperty({ example: 'Checkpoint del módulo 1' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    title: string;

    @ApiPropertyOptional({ example: 70, description: 'Porcentaje mínimo para aprobar (0-100)', default: 70 })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    passingScore?: number;

    @ApiPropertyOptional({
        type: [CreateQuestionDto],
        description: 'Preguntas iniciales. También se pueden agregar después.',
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => CreateQuestionDto)
    questions?: CreateQuestionDto[];
}
