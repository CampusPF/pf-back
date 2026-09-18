import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
    @ApiProperty({
        description: 'Token que llegó en el link del mail (?token=...)',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    @IsString()
    token: string;

    @ApiProperty({
        description:
            'Nueva contraseña (mínimo 6 caracteres, con mayúscula, minúscula y número)',
        example: 'SecurePass123',
        format: 'password',
        minLength: 6,
        maxLength: 50,
        writeOnly: true,
    })
    /* Exactamente las mismas reglas que RegisterDto.password: si acá fueran
       más laxas o más estrictas, un usuario podría terminar con una
       contraseña que el registro no habría aceptado (o al revés). */
    @IsString()
    @MinLength(6)
    @MaxLength(50)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message:
            'La contraseña debe incluir al menos una mayúscula, una minúscula y un número',
    })
    newPassword: string;
}
