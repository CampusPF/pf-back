import { IsEmail, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../common/utils/normalize-email.util';

export class LoginDto {
    @ApiProperty({
        description: 'Correo electrónico del usuario registrado',
        example: 'maria.gonzalez@campuslite.com',
        format: 'email',
        maxLength: 255,
    })
    // Normaliza ANTES de validar/usar: así "Usuario@Gmail.com" y
    // "usuario@gmail.com " (con espacio) resuelven al mismo usuario.
    @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
    @IsEmail()
    email: string;

    @ApiProperty({
        description: 'Contraseña del usuario (mínimo 6 caracteres)',
        example: 'SecurePass123',
        format: 'password',
        writeOnly: true,
        minLength: 6,
    })
    @IsString()
    password: string;
}