import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { CreateOptionDto } from './create-option.dto';
import { ExactlyOneCorrect } from './validators/exactly-one-correct.validator';

export class CreateQuestionDto {
    @ApiProperty({ example: '¿Qué es un @Controller en NestJS?' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    text: string;

    @ApiPropertyOptional({
        example: 1,
        description: 'Posición dentro del quiz. Si se omite, se agrega al final.',
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    order?: number;

    @ApiProperty({
        type: [CreateOptionDto],
        description: 'Al menos 2 opciones, exactamente una con isCorrect = true',
    })
    @IsArray()
    @ArrayMinSize(2, { message: 'Cada pregunta tiene que tener al menos 2 opciones' })
    @ArrayMaxSize(10)
    @ValidateNested({ each: true })
    @Type(() => CreateOptionDto)
    @ExactlyOneCorrect()
    options: CreateOptionDto[];
}
