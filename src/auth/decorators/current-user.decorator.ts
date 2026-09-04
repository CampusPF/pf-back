import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Uso: findProfile(@CurrentUser() user: any) { ... }
 * Devuelve el payload del usuario que JwtStrategy adjuntó al request.
 */
export const CurrentUser = createParamDecorator(
    (data: string | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user;
        return data ? user?.[data] : user;
    },
);