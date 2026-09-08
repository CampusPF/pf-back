import { IsEmail, IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';
import { normalizeEmail } from '../../common/utils/normalize-email.util';

export class CreateUserDto {
    @ApiProperty({
        description: 'Nombre completo del usuario',
        example: 'Juan Pérez',
        minLength: 1,
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Correo electrónico del usuario',
        example: 'juan.perez@ejemplo.com',
        format: 'email',
    })
    @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
    @IsEmail()
    email: string;

    @ApiProperty({
        description: 'Contraseña del usuario (mínimo 6 caracteres)',
        example: 'MiPassword123',
        minLength: 6,
        format: 'password',
        writeOnly: true,
    })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiPropertyOptional({
        description: 'Rol del usuario (opcional, solo para administradores)',
        enum: UserRole,
        example: UserRole.STUDENT,
        default: UserRole.STUDENT,
        required: false,
    })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
}