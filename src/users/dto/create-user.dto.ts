import {
    IsEmail,
    IsString,
    IsOptional,
    IsEnum,
    MinLength,
    MaxLength,
    IsDateString,
    Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';
import { normalizeEmail } from '../../common/utils/normalize-email.util';
import { IsAdult } from '../../auth/decorators/is-adult.decorator';

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

    /* Datos personales. Son opcionales acá (el alta por admin y el alta social
       con Google no los tienen) pero obligatorios en RegisterDto, que es el
       camino del formulario de registro. Antes no estaban en este DTO y por
       eso AuthService.register los descartaba silenciosamente. */

    @ApiPropertyOptional({
        description: 'Fecha de nacimiento (ISO 8601)',
        example: '1995-08-23',
    })
    @IsOptional()
    @IsDateString(
        {},
        { message: 'La fecha de nacimiento debe tener formato válido (YYYY-MM-DD)' },
    )
    @IsAdult()
    birthDate?: string;

    @ApiPropertyOptional({
        description: 'Teléfono con código de país',
        example: '+543511234567',
    })
    @IsOptional()
    @Matches(/^\+\d{8,15}$/, {
        message: 'El teléfono debe empezar con "+" y tener entre 8 y 15 dígitos',
    })
    phone?: string;

    @ApiPropertyOptional({ description: 'Dirección', maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    address?: string;

    @ApiPropertyOptional({ description: 'Ciudad', maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    city?: string;

    @ApiPropertyOptional({ description: 'País', maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    country?: string;
}