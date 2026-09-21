import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOptionDto {
    @ApiProperty({ example: 'Un decorador de clase', description: 'Texto de la opción' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    text: string;

    @ApiProperty({ example: true, description: 'Si es la opción correcta de la pregunta' })
    @IsBoolean()
    isCorrect: boolean;
}
