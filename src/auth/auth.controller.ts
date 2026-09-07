import {
    Controller,
    Post,
    Get,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
    Req,
    Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

// Se leen como función (no como valor) para que se resuelvan en cada request,
// ya bien cargado el .env, y no en el momento en que se evalúa el decorador.
const AUTH_THROTTLE_LIMIT = () => Number(process.env.THROTTLE_AUTH_LIMIT ?? 10);
const AUTH_THROTTLE_TTL_MS = () =>
    Number(process.env.THROTTLE_TTL ?? 60) * 1000;

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    // Rate limit estricto: son los dos endpoints donde se prueban credenciales.
    // Sin JWT todavía, el UserOrIpThrottlerGuard cuenta por IP, que es lo que
    // frena el ataque de fuerza bruta / relleno de credenciales.
    @Public()
    @Post('register')
    @Throttle({
        default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS },
    })
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({
        default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS },
    })
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    logout() {
        return { message: 'Sesión cerrada. Eliminá el token del lado del cliente.' };
    }

    @Public()
    @Get('google')
    @UseGuards(GoogleAuthGuard)
    googleAuth() {
        // No necesita cuerpo: el guard redirige automáticamente a la pantalla de login de Google
    }

    @Public()
    @Get('google/callback')
    @UseGuards(GoogleAuthGuard)
    async googleAuthCallback(@Req() req: any, @Res() res: Response) {
        const result = await this.authService.loginWithGoogle(req.user);

         const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
         return res.redirect(`${frontendUrl}/auth/callback?token=${result.access_token}`);
    }
}