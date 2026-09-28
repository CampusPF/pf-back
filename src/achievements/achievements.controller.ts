import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AchievementsService, type UserAchievementView } from './achievements.service';

/**
 * La pantalla de logros del usuario del token (el dueño sale del JWT, nunca
 * de un parámetro). GET /me/dashboard sigue trayendo el resumen para la home;
 * esto es el detalle: cada logro con cuánto le falta.
 *
 * La autenticación la pone el JwtAuthGuard global (ver app.module.ts).
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class AchievementsController {
    constructor(private readonly achievementsService: AchievementsService) { }

    @Get('achievements')
    @ApiOperation({ summary: 'Todos los logros, con los desbloqueados y el progreso de los que faltan' })
    @ApiOkResponse({
        schema: {
            example: [
                {
                    code: 'ten_lessons',
                    nombre: 'En marcha',
                    descripcion: 'Completá 10 lecciones',
                    icono: 'flame',
                    tipo: 'lessons_completed',
                    meta: 10,
                    actual: 7,
                    desbloqueado: false,
                    unlockedAt: null,
                    nuevo: false,
                },
            ],
        },
    })
    getMyAchievements(@CurrentUser('id') userId: string): Promise<UserAchievementView[]> {
        return this.achievementsService.getForUser(userId);
    }
}
