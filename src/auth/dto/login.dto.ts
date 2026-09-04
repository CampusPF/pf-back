import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({
        description: 'Correo electrónico del usuario registrado',
        example: 'maria.gonzalez@campuslite.com',
        format: 'email',
        maxLength: 255,
    })
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