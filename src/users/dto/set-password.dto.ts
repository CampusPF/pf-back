import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Match } from '../../auth/decorators/match.decorator';

/**
 * PATCH /users/me/password. Cubre los dos casos con un solo endpoint:
 *
 *   - La cuenta YA tiene contraseña → `currentPassword` es obligatoria y se
 *     verifica contra el hash. Es un cambio de contraseña.
 *   - La cuenta NO tiene contraseña (se creó con Google, passwordHash null) →
 *     `currentPassword` se ignora. Es un alta de contraseña, y a partir de ahí
 *     el usuario puede entrar también por email + contraseña.
 *
 * `currentPassword` es opcional en el DTO porque su obligatoriedad depende
 * del estado de la cuenta en la base, algo que class-validator no puede saber.
 * Ese chequeo vive en UsersService.setPassword.
 */
export class SetPasswordDto {
    @ApiPropertyOptional({
        description:
            'Contraseña actual. Obligatoria salvo que la cuenta no tenga ninguna (alta con Google).',
        format: 'password',
        writeOnly: true,
    })
    @IsOptional()
    @IsString()
    currentPassword?: string;

    @ApiProperty({
        description: 'Contraseña nueva',
        example: 'SecurePass123',
        format: 'password',
        minLength: 6,
        maxLength: 50,
        writeOnly: true,
    })
    @IsString()
    @MinLength(6)
    @MaxLength(50)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message:
            'La contraseña debe incluir al menos una mayúscula, una minúscula y un número',
    })
    password: string;

    @ApiProperty({
        description: 'Confirmación de la contraseña nueva',
        format: 'password',
        writeOnly: true,
    })
    @IsString()
    @Match('password', { message: 'Las contraseñas no coinciden' })
    confirmPassword: string;
}
