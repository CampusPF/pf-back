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
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import type { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { Public } from "./decorators/public.decorator";
import { Throttle } from "@nestjs/throttler";

// Se leen como función (no como valor) para que se resuelvan en cada request,
// ya bien cargado el .env, y no en el momento en que se evalúa el decorador.
const AUTH_THROTTLE_LIMIT = () => Number(process.env.THROTTLE_AUTH_LIMIT ?? 10);
const AUTH_THROTTLE_TTL_MS = () =>
  Number(process.env.THROTTLE_TTL ?? 60) * 1000;

/** Nombre de la cookie que lee el middleware/proxy del front. */
const AUTH_COOKIE_NAME = "campus.token";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Rate limit estricto: son los dos endpoints donde se prueban credenciales.
  // Sin JWT todavía, el UserOrIpThrottlerGuard cuenta por IP, que es lo que
  // frena el ataque de fuerza bruta / relleno de credenciales.
  @Public()
  @Post("register")
  @Throttle({
    default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS },
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setAuthCookie(res, result.access_token);
    return result; // passthrough:true → Nest sigue mandando esto como body JSON
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS },
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookie(res, result.access_token);
    return result;
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) res: Response) {
    // Complemento necesario de setAuthCookie: si seteamos la cookie en
    // login/register, logout tiene que borrarla, si no queda viva hasta
    // que expire sola aunque el cliente ya "cerró sesión".
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    return {
      message: "Sesión cerrada. Eliminá el token del lado del cliente.",
    };
  }

  @Public()
  @Get("google")
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // No necesita cuerpo: el guard redirige automáticamente a la pantalla de login de Google
  }

  @Public()
  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const frontendUrl = (process.env.FRONTEND_URL ?? "http://localhost:3000")
      .split(",")[0]
      .trim();

    // `state` es el ?flow=login|register que mandó el front (ver
    // GoogleAuthGuard). Google lo devuelve intacto. Decide, además de la
    // lógica del service, a qué pantalla se vuelve si algo falla.
    const flow = req.query?.state === "register" ? "register" : "login";

    let result: Awaited<ReturnType<AuthService["loginWithGoogle"]>>;
    try {
      result = await this.authService.loginWithGoogle(req.user, flow);
    } catch (error) {
      // Este endpoint es un redirect del navegador, no un fetch: si dejamos
      // que Nest devuelva el 401/409 como JSON el usuario queda en una página
      // muerta. En vez de eso lo mandamos de vuelta a la pantalla de la que
      // salió con un motivo, y sin dejar cookie de sesión.
      //   - not_registered: entró por /login pero no tiene cuenta.
      //   - already_registered: entró por /register pero el email ya existe.
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        const reason =
          error instanceof ConflictException
            ? "already_registered"
            : "not_registered";
        return res.redirect(`${frontendUrl}/${flow}?error=${reason}`);
      }
      throw error;
    }

    this.setAuthCookie(res, result.access_token);

    return res.redirect(
      `${frontendUrl}/auth/callback?token=${result.access_token}`,
    );
  }

  /**
   * Setea el JWT como cookie httpOnly, además de devolverlo en el body
   * (que el front hoy sigue leyendo directo — esto suma, no reemplaza).
   *
   * httpOnly: JS del front no puede leerla (mitiga robo por XSS).
   * secure: solo viaja por HTTPS en producción (en dev, sin HTTPS local,
   *   el navegador la descartaría si fuera true).
   * sameSite 'lax': la manda en navegación normal (ej. el redirect de
   *   Google) pero no en requests cross-site de terceros.
   */
  private setAuthCookie(res: Response, token: string): void {
    const isProduction = this.config.get<string>("NODE_ENV") === "production";
    const expiresInSeconds = Number(this.config.get("JWT_EXPIRES_IN") ?? 3600);

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: expiresInSeconds * 1000,
    });
  }
}
