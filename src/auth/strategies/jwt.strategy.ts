import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../users/entities/user.entity';
import { AccountDisabledException } from '../account-disabled.exception';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        config: ConfigService,
        private readonly usersService: UsersService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            ]),
            // false = el token vencido se rechaza (default de passport-jwt,
            // explícito acá para que no se cambie sin querer).
            ignoreExpiration: false,
            secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
        });
    }

    async validate(payload: { sub: string; email: string; role: string }) {
        const user = await this.usersService.findOne(payload.sub);

        // Se corre en TODO request autenticado: es lo que corta el acceso de
        // una cuenta dada de baja (o suspendida) aunque su JWT todavía no
        // haya vencido. Sin este chequeo, "eliminar" a alguien desde el panel
        // de admin no le sacaba el acceso real: sólo dejaba de listarlo.
        // 403 con motivo (no un 401 mudo): el front cierra la sesión Y le
        // explica a la persona por qué, en vez de sacarla sin decir nada.
        if (user.status !== UserStatus.ACTIVE) {
            throw new AccountDisabledException();
        }

        return { id: user.id, email: user.email, role: user.role };
    }
}