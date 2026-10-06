import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ModerateForumThreadDto {
    @ApiPropertyOptional({ description: 'Fija el hilo arriba de la lista' })
    @IsOptional()
    @IsBoolean()
    isPinned?: boolean;

    @ApiPropertyOptional({ description: 'Cierra el hilo: no admite respuestas de alumnos' })
    @IsOptional()
    @IsBoolean()
    isLocked?: boolean;
}

export class SetForumSolutionDto {
    @ApiPropertyOptional({ format: 'uuid', description: 'Respuesta que resuelve el hilo' })
    @IsUUID('4', { message: 'La respuesta indicada no es válida' })
    postId: string;
}
