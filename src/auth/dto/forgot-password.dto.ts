import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../common/utils/normalize-email.util';

export class ForgotPasswordDto {
    @ApiProperty({
        description: 'Email de la cuenta a recuperar',
        example: 'maria.gonzalez@campuslite.com',
        format: 'email',
    })
    // Mismo criterio que LoginDto/RegisterDto: normalizar antes de buscar, o
    // "Maria@Gmail.com " no encontraría la cuenta guardada en minúsculas.
    @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
    @IsEmail()
    email: string;
}
