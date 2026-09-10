import {
    IsDateString,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsAdult } from '../../auth/decorators/is-adult.decorator';

/**
 * Lo que un usuario puede cambiar de SU PROPIO perfil (PATCH /users/me).
 *
 * Deliberadamente separado de UpdateUserDto, que es el de administración e
 * incluye `role`. Acá no hay `role` ni `email`:
 *   - `role`: cambiarlo es una operación de admin.
 *   - `email`: es la credencial de login. Cambiarlo sin verificar el mail
 *     nuevo permite secuestrar cuentas, y además invalidaría el JWT en curso.
 * Como el ValidationPipe global corre con `forbidNonWhitelisted: true`, un
 * body que traiga cualquiera de los dos se rechaza solo con un 400. No hace
 * falta chequearlo a mano en el controller.
 */
export class UpdateProfileDto {
    @ApiPropertyOptional({ example: 'María González', minLength: 2, maxLength: 100 })
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    @Matches(/^\D*$/, { message: 'El nombre no puede contener números' })
    name?: string;

    // Ojo: IsAdult devuelve false ante un valor vacío, así que sólo sirve
    // para un campo opcional si va acompañado de @IsOptional() — que es
    // justamente lo que hace que class-validator saltee la validación
    // entera cuando el campo no viene.
    @ApiPropertyOptional({ example: '1995-08-23' })
    @IsOptional()
    @IsDateString(
        {},
        { message: 'La fecha de nacimiento debe tener formato válido (YYYY-MM-DD)' },
    )
    @IsAdult()
    birthDate?: string;

    @ApiPropertyOptional({ example: '+543511234567' })
    @IsOptional()
    @Matches(/^\+\d{8,15}$/, {
        message: 'El teléfono debe empezar con "+" y tener entre 8 y 15 dígitos',
    })
    phone?: string;

    @ApiPropertyOptional({ example: 'Av. Siempre Viva 742', maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    address?: string;

    @ApiPropertyOptional({ example: 'Córdoba', maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    city?: string;

    @ApiPropertyOptional({ example: 'Argentina', maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    country?: string;
}
