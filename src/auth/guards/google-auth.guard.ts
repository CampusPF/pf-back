import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
    /**
     * Propaga `?flow=login|register` a través del round-trip de OAuth usando
     * el parámetro `state` estándar: Google lo devuelve tal cual en el
     * callback (`req.query.state`), así el callback sabe desde qué pantalla
     * arrancó el usuario sin necesidad de sesión del lado del back.
     */
    getAuthenticateOptions(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        const flow = request.query?.flow === 'register' ? 'register' : 'login';
        return { state: flow };
    }
}
