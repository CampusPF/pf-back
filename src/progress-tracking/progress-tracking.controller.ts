import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserActivityService } from '../user-activity/user-activity.service';
import { ProgressStatsService } from './progress-stats.service';
import { XpService } from '../gamification/xp.service';
import { getLevelFromXp } from '../gamification/xp.config';
import { Achievement } from '../achievements/entities/achievement.entity';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';

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
    private readonly xpService: XpService,
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
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

  /**
   * Todo el panel del alumno en una sola llamada.
   *
   * Las seis consultas van en paralelo con Promise.all: son independientes
   * entre sí, y en serie el dashboard tardaría la suma de las seis en vez de
   * la más lenta.
   *
   * Reemplaza a GET /me/streak y GET /me/studied-time, que quedan andando
   * hasta que el front migre — sacarlos ahora rompería lo que ya funciona.
   */
  @Get('dashboard')
  @ApiOperation({ summary: 'Panel del alumno: nivel, XP, racha, horas, cursos y logros' })
  @ApiOkResponse({
    schema: {
      example: {
        nivel: 3,
        xp: 310,
        xpDelNivel: 60,
        xpParaElSiguiente: 250,
        rachaDias: 5,
        minutosEstudiados: 340,
        cursosActivos: 2,
        cursosCompletados: 1,
        logros: [
          {
            code: 'first_lesson',
            nombre: 'Primer paso',
            icono: 'footprints',
            unlockedAt: '2026-09-17T08:41:08.504Z',
          },
        ],
        logrosBloqueados: [
          {
            code: 'streak_7',
            nombre: 'Imparable',
            descripcion: 'Racha de 7 días seguidos',
            icono: 'fire',
          },
        ],
      },
    },
  })
  async getDashboard(@CurrentUser('id') userId: string) {
    const [xp, rachaDias, minutosEstudiados, desbloqueados, todosLosLogros, cursos] =
      await Promise.all([
        this.xpService.getTotalXp(userId),
        this.userActivityService.getCurrentStreak(userId),
        this.progressStatsService.getStudiedMinutes(userId),
        this.userAchievementRepository.find({
          where: { userId },
          relations: { achievement: true },
          order: { unlockedAt: 'DESC' },
        }),
        this.achievementRepository.find(),
        this.progressStatsService.countCoursesByStatus(userId),
      ]);

    const { level, xpIntoLevel, xpForNextLevel } = getLevelFromXp(xp);
    const desbloqueadosIds = new Set(desbloqueados.map((u) => u.achievementId));

    return {
      nivel: level,
      xp,
      xpDelNivel: xpIntoLevel,
      // null en el nivel máximo: no hay barra de progreso que mostrar.
      xpParaElSiguiente: xpForNextLevel,
      rachaDias,
      minutosEstudiados,
      cursosActivos: cursos.activos,
      cursosCompletados: cursos.completados,
      logros: desbloqueados.map((u) => ({
        code: u.achievement.code,
        nombre: u.achievement.name,
        icono: u.achievement.icon,
        unlockedAt: u.unlockedAt,
      })),
      // Los que faltan, para que el front pueda mostrarlos en gris con su
      // descripción ("qué me falta para conseguirlo").
      logrosBloqueados: todosLosLogros
        .filter((a) => !desbloqueadosIds.has(a.id))
        .map((a) => ({
          code: a.code,
          nombre: a.name,
          descripcion: a.description,
          icono: a.icon,
        })),
    };
  }
}
