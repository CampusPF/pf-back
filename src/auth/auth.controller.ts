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


@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
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