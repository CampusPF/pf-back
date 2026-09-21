import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

export class QuizAnswerDto {
    @ApiProperty({ example: 'a1b2c3d4-1234-4a5b-9abc-1234567890ab' })
    @IsUUID()
    questionId: string;

    @ApiProperty({ example: 'e5f6a7b8-1234-4a5b-9abc-1234567890ab' })
    @IsUUID()
    optionId: string;
}

/** Todas las respuestas juntas, en una sola llamada. Una pregunta sin responder simplemente no viene. */
export class SubmitAttemptDto {
    @ApiProperty({ type: [QuizAnswerDto] })
    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => QuizAnswerDto)
    answers: QuizAnswerDto[];
}
