import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class CreateConversationDto {
    @ApiProperty({
        example: 'b3f1c2a0-1234-4a5b-9abc-1234567890ab',
        description: 'ID de la lección sobre la que se abre la conversación con el tutor IA',
    })
    @IsUUID()
    @IsNotEmpty()
    lessonId: string;
}