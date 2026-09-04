import {
    IsEmail,
    IsString,
    MinLength,
    MaxLength,
    Matches,
    IsDateString,
    IsPhoneNumber,
    IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Match } from '../decorators/Match.decorator';

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
    @IsDateString({}, { message: 'La fecha de nacimiento debe tener formato válido (YYYY-MM-DD)' })
    birthDate: string;

    @ApiProperty({
        description: 'Número de teléfono (con código de país)',
        example: '+5493511234567',
        required: true,
    })
    @IsPhoneNumber(undefined, { message: 'El teléfono debe ser un número válido, incluyendo código de país' })
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