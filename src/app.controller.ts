import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

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
}
