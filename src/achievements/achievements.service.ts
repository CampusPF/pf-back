import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { Certificate } from '../certificates/entities/certificate.entity';
import { XpService } from '../gamification/xp.service';
import { getLevelFromXp } from '../gamification/xp.config';
import { UserActivityService } from '../user-activity/user-activity.service';
import { ProgressStatsService } from '../progress-tracking/progress-stats.service';

/** La forma del jsonb `condition` del catálogo (ver achievement.seed.ts). */
interface AchievementCondition {
    type: string;
    value: number;
}

@Injectable()
export class AchievementsService {
    private readonly logger = new Logger(AchievementsService.name);

    constructor(
        @InjectRepository(Achievement)
        private readonly achievementRepository: Repository<Achievement>,
        @InjectRepository(UserAchievement)
        private readonly userAchievementRepository: Repository<UserAchievement>,
        @InjectRepository(Certificate)
        private readonly certificateRepository: Repository<Certificate>,
        private readonly xpService: XpService,
        private readonly userActivityService: UserActivityService,
        private readonly progressStatsService: ProgressStatsService,
    ) { }

    /**
     * Revisa los logros que al usuario le faltan y desbloquea los que ya
     * cumple.
     *
     * Sólo evalúa los PENDIENTES: los ya desbloqueados no se vuelven a
     * consultar, así que a medida que el alumno los junta, esto hace cada vez
     * menos trabajo. Un logro desbloqueado no se revoca nunca, aunque la
     * condición deje de cumplirse (una racha que se corta no te quita el
     * logro de racha).
     */
    async evaluateForUser(userId: string): Promise<void> {
        const unlocked = await this.userAchievementRepository.find({
            where: { userId },
            select: { achievementId: true },
        });
        const unlockedIds = new Set(unlocked.map((u) => u.achievementId));

        const all = await this.achievementRepository.find();
        const pending = all.filter((a) => !unlockedIds.has(a.id));

        if (pending.length === 0) return;

        for (const achievement of pending) {
            const condition = achievement.condition as unknown as AchievementCondition;

            if (await this.checkCondition(userId, condition)) {
                await this.unlock(userId, achievement.id);
            }
        }
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

    /**
     * Traduce una condición del catálogo a una pregunta concreta.
     *
     * Un `type` desconocido devuelve false en vez de romper: si alguien siembra
     * un logro con una condición que este switch todavía no entiende, ese logro
     * simplemente no se desbloquea, y el resto sigue funcionando.
     */
    private async checkCondition(
        userId: string,
        condition: AchievementCondition,
    ): Promise<boolean> {
        switch (condition.type) {
            case 'lessons_completed':
                return (
                    (await this.progressStatsService.countCompletedLessons(userId)) >=
                    condition.value
                );

            case 'courses_completed': {
                const counts = await this.progressStatsService.countCoursesByStatus(userId);
                return counts.completados >= condition.value;
            }

            case 'streak_days':
                return (
                    (await this.userActivityService.getCurrentStreak(userId)) >=
                    condition.value
                );

            case 'certificates_issued':
                return (
                    (await this.certificateRepository.count({ where: { userId } })) >=
                    condition.value
                );

            case 'level_reached': {
                const xp = await this.xpService.getTotalXp(userId);
                return getLevelFromXp(xp).level >= condition.value;
            }

            default:
                this.logger.warn(
                    `Condición de logro desconocida: "${condition.type}". Ese logro no se va a desbloquear nunca hasta que se agregue acá.`,
                );
                return false;
        }
    }
}
