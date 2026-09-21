import { PartialType } from '@nestjs/swagger';
import { CreateQuestionDto } from './create-question.dto';

/**
 * Si viene `options`, REEMPLAZA el set completo de opciones de la pregunta
 * (con las mismas reglas que al crear). Validar "exactamente una correcta"
 * sobre un parche parcial de opciones sería ambiguo.
 */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) { }
