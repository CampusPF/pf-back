import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { Certificate } from '../certificates/entities/certificate.entity';
import { QuizAttempt } from '../quizzes/entities/quiz-attempt.entity';
import { AchievementsService } from './achievements.service';
import { AchievementMetricsService } from './achievement-metrics.service';
import { AchievementsListener } from './achievements.listener';
import { AchievementsController } from './achievements.controller';
import { GamificationModule } from '../gamification/gamification.module';
import { UserActivityModule } from '../user-activity/user-activity.module';
import { ProgressTrackingModule } from '../progress-tracking/progress-tracking.module';

/**
 * Evaluación y desbloqueo de logros, y GET /me/achievements (el detalle con
 * progreso). El resumen de la home sigue en GET /me/dashboard.
 *
 * Este módulo depende de progress-tracking (le pide los conteos) y no al
 * revés — el dashboard lee las tablas de logros con sus repos, así no hay
 * dependencia circular entre los dos módulos.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([Achievement, UserAchievement, Certificate, QuizAttempt]),
        GamificationModule,
        UserActivityModule,
        ProgressTrackingModule,
    ],
    controllers: [AchievementsController],
    providers: [AchievementsService, AchievementMetricsService, AchievementsListener],
    exports: [AchievementsService],
})
export class AchievementsModule { }
