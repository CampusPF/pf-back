import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Liveness / readiness probe para el hosting (Railway, Render, etc.).
 *
 * Es @Public() a propósito: el orquestador que chequea la salud del servicio
 * no tiene ni puede tener un JWT. No expone ningún dato: solo si la app y la
 * conexión a la base responden.
 *
 * @SkipThrottle porque el hosting la llama cada pocos segundos y consumiría
 * la cuota de rate limit de la IP del proxy.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado del servicio y de la conexión a la base' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
    ]);
  }
}
