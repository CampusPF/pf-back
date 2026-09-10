import {
    IsEmail,
    IsString,
    MinLength,
    MaxLength,
    Matches,
    IsDateString,
    IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Match } from '../decorators/match.decorator';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { IsAdult } from '../decorators/is-adult.decorator';

export class RegisterDto {
    @ApiProperty({
        description: 'Nombre completo del usuario (requerido)',
        example: 'María González Pérez',
        minLength: 2,
        maxLength: 100,
        required: true,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name: string;

    @ApiProperty({
        description: 'Correo electrónico válido del usuario',
        example: 'maria.gonzalez@campuslite.com',
        format: 'email',
        maxLength: 255,
        required: true,
    })
    // Normaliza ANTES de validar/usar: así "Usuario@Gmail.com" y
    // "usuario@gmail.com " (con espacio) resuelven al mismo usuario, y no
    // crean una cuenta duplicada respecto de un login posterior por Google.
    @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
    @IsEmail()
    email: string;

    @ApiProperty({
        description: 'Contraseña segura (mínimo 6 caracteres, debe incluir mayúsculas, minúsculas y números)',
        example: 'SecurePass123',
        format: 'password',
        minLength: 6,
        maxLength: 50,
        writeOnly: true,
        required: true,
    })
    @IsString()
    @MinLength(6)
    @MaxLength(50)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'La contraseña debe incluir al menos una mayúscula, una minúscula y un número',
    })
    password: string;

    @ApiProperty({
        description: 'Confirmación de la contraseña (debe coincidir con password)',
        example: 'SecurePass123',
        format: 'password',
        writeOnly: true,
        required: true,
    })
    @IsString()
    @Match('password', { message: 'Las contraseñas no coinciden' })
    confirmPassword: string;

    @ApiProperty({
        description: 'Fecha de nacimiento (formato ISO 8601)',
        example: '1995-08-23',
        required: true,
    })
    @IsDateString(
        {},
        { message: 'La fecha de nacimiento debe tener formato válido (YYYY-MM-DD)' },
    )
    @IsAdult()
    birthDate: string;

    @ApiProperty({
        description: 'Número de teléfono (con código de país)',
        example: '+543511234567',
        required: true,
    })
    @Matches(/^\+\d{8,15}$/, {
        message: 'El teléfono debe empezar con "+" y tener entre 8 y 15 dígitos',
    })
    phone: string;

    @ApiPropertyOptional({
        description: 'Dirección del usuario',
        example: 'Av. Siempre Viva 742',
        maxLength: 200,
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    address?: string;

    @ApiPropertyOptional({
        description: 'Ciudad del usuario',
        example: 'Córdoba',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    city?: string;

    @ApiPropertyOptional({
        description: 'País del usuario',
        example: 'Argentina',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    country?: string;
}