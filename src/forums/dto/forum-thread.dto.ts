import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { FORUM_POST_BODY_MAX, FORUM_THREAD_BODY_MAX, FORUM_THREAD_TITLE_MAX } from '../forum.constants';

export class CreateForumThreadDto {
    @ApiProperty({ example: '¿Cómo entregan el TP final?', maxLength: FORUM_THREAD_TITLE_MAX })
    @IsString({ message: 'El título es obligatorio' })
    @MinLength(3, { message: 'El título tiene que tener al menos 3 caracteres' })
    @MaxLength(FORUM_THREAD_TITLE_MAX, { message: `El título no puede superar los ${FORUM_THREAD_TITLE_MAX} caracteres` })
    title: string;

    @ApiProperty({ maxLength: FORUM_THREAD_BODY_MAX })
    @IsString({ message: 'El mensaje es obligatorio' })
    @Length(1, FORUM_THREAD_BODY_MAX, { message: `El mensaje tiene que tener entre 1 y ${FORUM_THREAD_BODY_MAX} caracteres` })
    body: string;
}

export class UpdateForumThreadDto {
    @ApiPropertyOptional({ maxLength: FORUM_THREAD_TITLE_MAX })
    @IsOptional()
    @IsString()
    @MinLength(3, { message: 'El título tiene que tener al menos 3 caracteres' })
    @MaxLength(FORUM_THREAD_TITLE_MAX, { message: `El título no puede superar los ${FORUM_THREAD_TITLE_MAX} caracteres` })
    title?: string;

    @ApiPropertyOptional({ maxLength: FORUM_THREAD_BODY_MAX })
    @IsOptional()
    @IsString()
    @Length(1, FORUM_THREAD_BODY_MAX, { message: `El mensaje tiene que tener entre 1 y ${FORUM_THREAD_BODY_MAX} caracteres` })
    body?: string;
}

export class CreateForumPostDto {
    @ApiProperty({ maxLength: FORUM_POST_BODY_MAX })
    @IsString({ message: 'La respuesta es obligatoria' })
    @Length(1, FORUM_POST_BODY_MAX, { message: `La respuesta tiene que tener entre 1 y ${FORUM_POST_BODY_MAX} caracteres` })
    body: string;
}

export class UpdateForumPostDto {
    @ApiProperty({ maxLength: FORUM_POST_BODY_MAX })
    @IsString({ message: 'La respuesta es obligatoria' })
    @Length(1, FORUM_POST_BODY_MAX, { message: `La respuesta tiene que tener entre 1 y ${FORUM_POST_BODY_MAX} caracteres` })
    body: string;
}
