import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AdminStats, AdminStatsService } from './admin-stats.service';
import { AdminStatsQuery } from './dto/admin-stats.query';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary: 'Métricas del panel: la plataforma (admin) o mis cursos (docente)',
    description:
      'Totales, comparación contra el período anterior de igual largo, inscripciones por día, ' +
      'ingresos por mes (12 meses), top 5 de cursos y últimas inscripciones. El alcance lo ' +
      'decide el rol del token: el docente ve sólo sus cursos y sus ventas.',
  })
  @ApiResponse({ status: 403, description: 'Sólo administradores y docentes' })
  getStats(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query() query: AdminStatsQuery,
  ): Promise<AdminStats> {
    return this.statsService.getStats(user, query.days ?? 30);
  }
}
