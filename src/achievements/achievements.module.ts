import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { Certificate } from '../certificates/entities/certificate.entity';
import { AchievementsService } from './achievements.service';
import { AchievementsListener } from './achievements.listener';
import { GamificationModule } from '../gamification/gamification.module';
import { UserActivityModule } from '../user-activity/user-activity.module';
import { ProgressTrackingModule } from '../progress-tracking/progress-tracking.module';

/**
 * Evaluación y desbloqueo de logros.
 *
 * Sin controller: los logros se muestran dentro de GET /me/dashboard. Por eso
 * este módulo depende de progress-tracking (le pide los conteos) y no al
 * revés — el dashboard lee las tablas de logros con sus repos, así no hay
 * dependencia circular entre los dos módulos.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([Achievement, UserAchievement, Certificate]),
        GamificationModule,
        UserActivityModule,
        ProgressTrackingModule,
    ],
    providers: [AchievementsService, AchievementsListener],
    exports: [AchievementsService],
})
export class AchievementsModule { }
