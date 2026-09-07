import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard de JWT.
 *
 * Está registrado como guard GLOBAL en app.module.ts, así que por defecto
 * TODA ruta exige un token válido. Las rutas que deben ser accesibles sin
 * login se marcan explícitamente con @Public().
 *
 * Sigue funcionando igual si se usa con @UseGuards(JwtAuthGuard) a nivel de
 * controller (queda redundante, pero no molesta).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }
}
