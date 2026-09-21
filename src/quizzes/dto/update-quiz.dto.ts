import { PartialType, PickType } from '@nestjs/swagger';
import { CreateQuizDto } from './create-quiz.dto';

// No se reasigna un quiz a otro curso ni a otro módulo vía update; las
// preguntas se editan con sus propias rutas.
export class UpdateQuizDto extends PartialType(
    PickType(CreateQuizDto, ['title', 'passingScore'] as const),
) { }
