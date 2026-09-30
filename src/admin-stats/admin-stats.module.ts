import { Module } from '@nestjs/common';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';

/**
 * Métricas agregadas del panel de administración (GET /admin/stats). Sólo
 * lee: consultas SQL con COUNT/SUM sobre las tablas de los otros módulos,
 * sin entidades propias.
 */
@Module({
  controllers: [AdminStatsController],
  providers: [AdminStatsService],
})
export class AdminStatsModule {}
