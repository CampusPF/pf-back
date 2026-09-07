import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Público a propósito: es el "ping" de la raíz, no devuelve ningún dato.
  // Para el health check real del hosting está GET /health.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // TODO(seguridad): TEMPORAL, solo para diagnosticar el trust proxy en
  // Render. Sacar este endpoint apenas confirmemos la causa del rate limit.
  @Public()
  @SkipThrottle()
  @Get('__debug-ip')
  debugIp(@Req() req: Request) {
    return {
      ip: req.ip,
      ips: req.ips,
      xForwardedFor: req.headers['x-forwarded-for'],
      xRealIp: req.headers['x-real-ip'],
      remoteAddress: req.socket?.remoteAddress,
    };
  }
}
