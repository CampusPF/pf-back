import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { TUTOR_QUICK_ACTIONS } from '../tutor-prompt';
import type { TutorQuickAction } from '../tutor-prompt';

const ACTIONS = Object.keys(TUTOR_QUICK_ACTIONS);

/** Se manda `content` (texto libre) O `action` (una burbuja), no los dos. */
export class CreateMessageDto {
  @ApiPropertyOptional({
    example: '¿Podés explicarme de nuevo qué es un closure?',
    description: 'Mensaje libre del estudiante. Requerido si no se manda `action`.',
  })
  @ValidateIf((o: CreateMessageDto) => !o.action)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({
    enum: ACTIONS,
    description: 'Acción rápida (burbuja). Si viene, se ignora `content`.',
  })
  @IsOptional()
  @IsIn(ACTIONS)
  action?: TutorQuickAction;
}
