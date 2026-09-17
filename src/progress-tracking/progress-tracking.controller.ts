import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserActivityService } from '../user-activity/user-activity.service';
import { ProgressStatsService } from './progress-stats.service';

/**
 * Métricas de progreso del usuario del token.
 *
 * TEMPORAL: estos dos endpoints existen para poder mostrar racha y horas antes
 * de que esté el dashboard. El martes los consume un único GET /me/dashboard y
 * estos se borran — por eso no tienen DTOs ni paginación ni nada elaborado.
 *
 * Nunca reciben un userId: el dueño sale del JWT. Un endpoint /me que acepte
 * id por parámetro es un endpoint por el que cualquiera lee la actividad de
 * cualquiera.
 *
 * La autenticación la pone el JwtAuthGuard global (ver app.module.ts).
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class ProgressTrackingController {
  constructor(
    private readonly userActivityService: UserActivityService,
    private readonly progressStatsService: ProgressStatsService,
  ) { }

  @Get('streak')
  @ApiOperation({ summary: 'Días seguidos que vengo estudiando' })
  @ApiOkResponse({ schema: { example: { streakDays: 5 } } })
  async getStreak(@CurrentUser('id') userId: string): Promise<{ streakDays: number }> {
    return { streakDays: await this.userActivityService.getCurrentStreak(userId) };
  }

  @Get('studied-time')
  @ApiOperation({ summary: 'Minutos estudiados en total' })
  @ApiOkResponse({ schema: { example: { minutes: 340 } } })
  async getStudiedTime(@CurrentUser('id') userId: string): Promise<{ minutes: number }> {
    return { minutes: await this.progressStatsService.getStudiedMinutes(userId) };
  }
}
