import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';

/** Lo que viaja dentro del token de reseteo. */
interface ResetTokenPayload {
    sub: string;
    purpose: string;
    /** Huella del hash de contraseña vigente al emitir el token. */
    fp: string;
}

/** Marca el propósito del token, para que no se confunda con uno de sesión. */
const RESET_PURPOSE = 'password_reset';

/**
 * Tokens de "recuperar contraseña", SIN tabla en la base.
 *
 * El token es un JWT con tres propiedades:
 *
 *  1. Firmado con JWT_RESET_SECRET, un secret DISTINTO al de las sesiones. Un
 *     token de reseteo filtrado no sirve como sesión, y viceversa.
 *  2. Expira en 1 hora.
 *  3. Lleva una huella (`fp`) del hash de contraseña que el usuario tenía
 *     cuando se emitió. Al cambiar la contraseña, el hash cambia, la huella
 *     deja de coincidir y el token queda inválido solo — de ahí sale el "un
 *     solo uso" sin guardar nada en ningún lado.
 *
 * Lo que se guarda en el token es un hash del hash, cortado: no expone el
 * bcrypt real del usuario ni permite reconstruirlo.
 */
@Injectable()
export class ResetTokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
    ) { }

    /**
     * `passwordHash` puede ser null: una cuenta creada con Google todavía no
     * tiene contraseña. En ese caso la huella se calcula sobre string vacío,
     * de forma consistente al emitir y al verificar, así el flujo también
     * sirve para que esa cuenta se cree su primera contraseña.
     */
    private fingerprint(passwordHash: string | null): string {
        return createHash('sha256')
            .update(passwordHash ?? '')
            .digest('hex')
            .slice(0, 16);
    }

    generate(userId: string, currentPasswordHash: string | null): string {
        return this.jwtService.sign(
            {
                sub: userId,
                purpose: RESET_PURPOSE,
                fp: this.fingerprint(currentPasswordHash),
            },
            {
                secret: this.config.getOrThrow<string>('JWT_RESET_SECRET'),
                expiresIn: '1h',
            },
        );
    }

    /** Lanza 400 si el token está vencido, mal firmado o no es de reseteo. */
    verify(token: string): { userId: string; fp: string } {
        let payload: ResetTokenPayload;

        try {
            payload = this.jwtService.verify<ResetTokenPayload>(token, {
                secret: this.config.getOrThrow<string>('JWT_RESET_SECRET'),
            });
        } catch {
            throw new BadRequestException(
                'El link expiró o no es válido. Pedí uno nuevo.',
            );
        }

        /* Sin este chequeo, un access token de sesión firmado con el MISMO
           secret podría pasar por token de reseteo. Hoy los secrets son
           distintos, así que es una segunda barrera — barata y que cubre el
           día que alguien configure los dos iguales por error. */
        if (payload.purpose !== RESET_PURPOSE) {
            throw new BadRequestException('Token inválido.');
        }

        return { userId: payload.sub, fp: payload.fp };
    }

    /** false = la contraseña cambió desde que se emitió el token. */
    matchesCurrentPassword(fp: string, currentPasswordHash: string | null): boolean {
        return fp === this.fingerprint(currentPasswordHash);
    }
}
