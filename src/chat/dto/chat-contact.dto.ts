import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

export class ChatContactUserDto {
    @ApiProperty({ example: 'a3f1c2d4-5b6e-4f70-8a9b-0c1d2e3f4a5b' })
    id: string;

    @ApiProperty({ example: 'Ana Pérez' })
    name: string;

    @ApiProperty({ example: 'https://res.cloudinary.com/.../avatar.png', nullable: true, type: String })
    avatarUrl: string | null;

    @ApiProperty({ enum: [UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN] })
    role: UserRole;
}

export class ChatContactCourseDto {
    @ApiProperty({ example: 'b4e2d3c5-6a7f-4081-9bac-1d2e3f4a5b6c' })
    id: string;

    @ApiProperty({ example: 'introduccion-a-typescript' })
    slug: string;

    @ApiProperty({ example: 'Introducción a TypeScript' })
    title: string;
}

export class ChatContactLastMessageDto {
    @ApiProperty({ example: 'Hola, ¿podrías ayudarme con esta lección?' })
    content: string;

    @ApiProperty({ example: 'a3f1c2d4-5b6e-4f70-8a9b-0c1d2e3f4a5b' })
    senderId: string;

    @ApiProperty({ example: '2026-09-27T14:05:00.000Z' })
    createdAt: Date;
}

/**
 * Una persona con quien el usuario logueado puede chatear: para un alumno,
 * cada docente de sus cursos activos; para un docente, cada alumno inscripto
 * en alguno de sus cursos. `courses` son los cursos que comparten.
 */
export class ChatContactDto {
    @ApiProperty({ type: ChatContactUserDto })
    user: ChatContactUserDto;

    @ApiProperty({ type: ChatContactCourseDto, isArray: true })
    courses: ChatContactCourseDto[];

    @ApiProperty({ type: ChatContactLastMessageDto, nullable: true })
    lastMessage: ChatContactLastMessageDto | null;

    @ApiProperty({ example: 2, description: 'Mensajes recibidos de este contacto sin leer' })
    unreadCount: number;
}
