import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendMessageDto {
    @ApiProperty({
        example: 'Hola, ¿podrías ayudarme con esta lección?',
        description: 'Contenido del mensaje',
    })
    @IsString()
    @IsNotEmpty()
    content: string;
}

