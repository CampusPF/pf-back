import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    example: '¿Podés explicarme de nuevo qué es un closure?',
    description: 'Mensaje del estudiante para el tutor IA',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}