import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

const UNSUBSCRIBE_PURPOSE = 'email_unsubscribe';

/**
 * Tokens de los links "no quiero recibir más recordatorios".
 *
 * JWT firmado con un secret propio (JWT_UNSUBSCRIBE_SECRET) y con `purpose`,
 * igual que ResetTokenService: no sirve como sesión ni como reset. Dura 60
 * días: el link tiene que seguir funcionando en un mail viejo, y lo peor que
 * puede hacer alguien con uno filtrado es desuscribir a esa persona de los
 * recordatorios.
 */
@Injectable()
export class UnsubscribeTokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
    ) { }

    generate(userId: string): string {
        return this.jwtService.sign(
            { sub: userId, purpose: UNSUBSCRIBE_PURPOSE },
            { secret: this.secret(), expiresIn: '60d' },
        );
    }

    /** Devuelve el userId. Lanza 400 si el token no es válido. */
    verify(token: string): string {
        let payload: { sub: string; purpose: string };
        try {
            payload = this.jwtService.verify(token, { secret: this.secret() });
        } catch {
            throw new BadRequestException('El link de baja expiró o no es válido.');
        }
        if (payload.purpose !== UNSUBSCRIBE_PURPOSE) {
            throw new BadRequestException('Token inválido.');
        }
        return payload.sub;
    }

    private secret(): string {
        return this.config.getOrThrow<string>('JWT_UNSUBSCRIBE_SECRET');
    }
}
