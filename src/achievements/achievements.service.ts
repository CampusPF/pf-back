import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import {
    AchievementMetricsService,
    isAchievementMetric,
    type AchievementMetrics,
} from './achievement-metrics.service';

/** La forma del jsonb `condition` del catálogo (ver achievement.seed.ts). */
interface AchievementCondition {
    type: string;
    value: number;
}

/** Un logro visto por un usuario puntual, con su progreso (GET /me/achievements). */
export interface UserAchievementView {
    code: string;
    nombre: string;
    descripcion: string;
    icono: string;
    /** El `type` de la condición: el front lo usa para agrupar y para la unidad ("lecciones", "días"). */
    tipo: string;
    meta: number;
    /** Topeado en `meta`: un logro de 10 lecciones con 14 hechas muestra 10/10. */
    actual: number;
    desbloqueado: boolean;
    unlockedAt: Date | null;
    /** Se desbloqueó en ESTA consulta: el front lo puede celebrar una sola vez. */
    nuevo: boolean;
}

@Injectable()
export class AchievementsService {
    private readonly logger = new Logger(AchievementsService.name);

    constructor(
        @InjectRepository(Achievement)
        private readonly achievementRepository: Repository<Achievement>,
        @InjectRepository(UserAchievement)
        private readonly userAchievementRepository: Repository<UserAchievement>,
        private readonly metricsService: AchievementMetricsService,
    ) { }

    /**
     * Revisa los logros que al usuario le faltan y desbloquea los que ya
     * cumple. Devuelve los ids de los que se desbloquearon ahora.
     *
     * Sólo evalúa los PENDIENTES, y las métricas se cargan una sola vez (en
     * paralelo) para todos. Un logro desbloqueado no se revoca nunca, aunque
     * la condición deje de cumplirse (una racha que se corta no te quita el
     * logro de racha).
     */
    async evaluateForUser(userId: string): Promise<string[]> {
        const [unlocked, all] = await Promise.all([
            this.userAchievementRepository.find({ where: { userId }, select: { achievementId: true } }),
            this.achievementRepository.find(),
        ]);
        const unlockedIds = new Set(unlocked.map((u) => u.achievementId));
        const pending = all.filter((a) => !unlockedIds.has(a.id));
        if (pending.length === 0) return [];

        const metrics = await this.metricsService.getMetrics(userId);
        const newlyUnlocked: string[] = [];

        for (const achievement of pending) {
            if (this.isMet(achievement, metrics)) {
                await this.unlock(userId, achievement.id);
                newlyUnlocked.push(achievement.id);
            }
        }
        return newlyUnlocked;
    }

    /**
     * Todos los logros del catálogo con el progreso del usuario.
     *
     * Evalúa antes de responder: así un logro nuevo del catálogo (o uno que
     * el usuario ya cumplía antes de que existiera) aparece desbloqueado al
     * abrir la pantalla, sin esperar a la próxima lección completada.
     */
    async getForUser(userId: string): Promise<UserAchievementView[]> {
        const newlyUnlocked = new Set(await this.evaluateForUser(userId));

        const [all, unlocked, metrics] = await Promise.all([
            this.achievementRepository.find(),
            this.userAchievementRepository.find({ where: { userId } }),
            this.metricsService.getMetrics(userId),
        ]);
        const unlockedAt = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));

        return all
            .map((achievement) => {
                const { type, value } = this.conditionOf(achievement);
                const current = isAchievementMetric(type) ? metrics[type] : 0;
                const date = unlockedAt.get(achievement.id) ?? null;
                return {
                    code: achievement.code,
                    nombre: achievement.name,
                    descripcion: achievement.description,
                    icono: achievement.icon,
                    tipo: type,
                    meta: value,
                    actual: date ? value : Math.min(current, value),
                    desbloqueado: date !== null,
                    unlockedAt: date,
                    nuevo: newlyUnlocked.has(achievement.id),
                };
            })
            .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.meta - b.meta);
    }

    /**
     * El `orIgnore()` se apoya en el único (user_id, achievement_id): si dos
     * eventos casi simultáneos evalúan lo mismo, el segundo no rompe ni
     * duplica.
     */
    private async unlock(userId: string, achievementId: string): Promise<void> {
        await this.userAchievementRepository
            .createQueryBuilder()
            .insert()
            .into(UserAchievement)
            .values({ userId, achievementId })
            .orIgnore()
            .execute();
    }

    private conditionOf(achievement: Achievement): AchievementCondition {
        return achievement.condition as unknown as AchievementCondition;
    }

    /**
     * Un `type` desconocido devuelve false en vez de romper: si alguien siembra
     * un logro con una condición que todavía no está en ACHIEVEMENT_METRICS,
     * ese logro simplemente no se desbloquea, y el resto sigue funcionando.
     */
    private isMet(achievement: Achievement, metrics: AchievementMetrics): boolean {
        const { type, value } = this.conditionOf(achievement);
        if (!isAchievementMetric(type)) {
            this.logger.warn(
                `Condición de logro desconocida: "${type}". Ese logro no se va a desbloquear nunca hasta que se agregue a ACHIEVEMENT_METRICS.`,
            );
            return false;
        }
        return metrics[type] >= value;
    }
}
