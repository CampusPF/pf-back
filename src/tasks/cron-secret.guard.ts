import {
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const CRON_SECRET_HEADER = 'x-cron-secret';

/**
 * Deja pasar sólo a quien traiga el `CRON_SECRET` en el header. Es la puerta
 * de las tareas programadas, que las dispara un cron EXTERNO y por lo tanto
 * no tiene sesión ni JWT.
 *
 * Dos decisiones:
 *  - Sin `CRON_SECRET` configurado responde 404, no 401. Si alguien despliega
 *    sin la variable, el endpoint directamente no existe en vez de quedar
 *    abierto o anunciarse. Nunca hay un default.
 *  - La comparación es de tiempo constante (`timingSafeEqual`). Un `===`
 *    corta en el primer carácter distinto y filtra, medición mediante, cuánto
 *    del secreto acertaste.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
    constructor(private readonly config: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const expected = this.config.get<string>('CRON_SECRET');
        if (!expected) throw new NotFoundException();

        const request = context.switchToHttp().getRequest<Request>();
        const header = request.headers[CRON_SECRET_HEADER];
        const received = Array.isArray(header) ? header[0] : header;

        if (!received || !safeEquals(received, expected)) {
            throw new UnauthorizedException('Secreto de cron inválido.');
        }
        return true;
    }
}

function safeEquals(received: string, expected: string): boolean {
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    // timingSafeEqual exige el mismo largo; comparar los largos no filtra el
    // contenido del secreto.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
