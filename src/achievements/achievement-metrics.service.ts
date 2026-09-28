import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Certificate } from '../certificates/entities/certificate.entity';
import { QuizAttempt } from '../quizzes/entities/quiz-attempt.entity';
import { XpService } from '../gamification/xp.service';
import { getLevelFromXp } from '../gamification/xp.config';
import { UserActivityService } from '../user-activity/user-activity.service';
import { ProgressStatsService } from '../progress-tracking/progress-stats.service';

/**
 * Los `type` de condición que entiende el catálogo (ver achievement.seed.ts).
 * Agregar uno = sumarlo acá y en `getMetrics`; TypeScript no deja olvidarse
 * del segundo paso porque el Record tiene que estar completo.
 */
export const ACHIEVEMENT_METRICS = [
    'lessons_completed',
    'courses_enrolled',
    'courses_completed',
    'streak_days',
    'quizzes_passed',
    'studied_minutes',
    'certificates_issued',
    'level_reached',
] as const;

export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number];

export type AchievementMetrics = Record<AchievementMetric, number>;

export function isAchievementMetric(type: string): type is AchievementMetric {
    return (ACHIEVEMENT_METRICS as readonly string[]).includes(type);
}

/**
 * Dónde está parado el usuario en cada métrica que puede desbloquear un
 * logro. Se carga todo de una vez y en paralelo: sirve tanto para evaluar qué
 * se desbloquea como para mostrar "te faltan 3 lecciones" — el mismo número en
 * los dos lados, así lo que dice la barra de progreso es exactamente lo que
 * decide el desbloqueo.
 */
@Injectable()
export class AchievementMetricsService {
    constructor(
        @InjectRepository(Certificate)
        private readonly certificateRepository: Repository<Certificate>,
        @InjectRepository(QuizAttempt)
        private readonly quizAttemptRepository: Repository<QuizAttempt>,
        private readonly xpService: XpService,
        private readonly userActivityService: UserActivityService,
        private readonly progressStatsService: ProgressStatsService,
    ) { }

    async getMetrics(userId: string): Promise<AchievementMetrics> {
        const [lessons, courses, streak, quizzes, minutes, certificates, xp] = await Promise.all([
            this.progressStatsService.countCompletedLessons(userId),
            this.progressStatsService.countCoursesByStatus(userId),
            this.userActivityService.getCurrentStreak(userId),
            this.countPassedQuizzes(userId),
            this.progressStatsService.getStudiedMinutes(userId),
            this.certificateRepository.count({ where: { userId } }),
            this.xpService.getTotalXp(userId),
        ]);

        return {
            lessons_completed: lessons,
            courses_enrolled: courses.activos + courses.completados,
            courses_completed: courses.completados,
            streak_days: streak,
            quizzes_passed: quizzes,
            studied_minutes: minutes,
            certificates_issued: certificates,
            level_reached: getLevelFromXp(xp).level,
        };
    }

    /** Checkpoints distintos aprobados: reintentar uno ya aprobado no suma. */
    private async countPassedQuizzes(userId: string): Promise<number> {
        const row = await this.quizAttemptRepository
            .createQueryBuilder('attempt')
            .where('attempt.userId = :userId', { userId })
            .andWhere('attempt.passed = true')
            .select('COUNT(DISTINCT attempt.quizId)', 'total')
            .getRawOne<{ total: string }>();

        return Number(row?.total ?? 0);
    }
}
