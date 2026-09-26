import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard que cuenta por USUARIO cuando la request está autenticada,
 * y por IP cuando no lo está.
 *
 * Por qué importa: detrás de una universidad, una oficina o un CGNAT, miles de
 * usuarios comparten IP pública. Contar solo por IP haría que un alumno se
 * coma el cupo de todos sus compañeros. Y al revés: contar solo por usuario
 * dejaría el login sin protección, porque ahí todavía no hay usuario.
 *
 * Requiere que JwtAuthGuard corra ANTES que este guard (ver el orden de los
 * APP_GUARD en app.module.ts), que es lo que deja `request.user` disponible.
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    // El rate limiting no aplica a WebSockets. El guard de la librería
    // llama a res.header(), que no existe en un socket.
    if (context.getType() !== 'http') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.id;
    if (userId) return `user:${userId}`;

    // req.ip depende de 'trust proxy' (configurado en main.ts) para devolver
    // la IP real del cliente y no la del reverse proxy.
    return `ip:${req.ip ?? req.ips?.[0] ?? 'unknown'}`;
  }
}
