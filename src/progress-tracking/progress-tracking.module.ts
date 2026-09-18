import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Achievement } from '../achievements/entities/achievement.entity';
import { UserAchievement } from '../achievements/entities/user-achievement.entity';
import { UserActivityModule } from '../user-activity/user-activity.module';
import { GamificationModule } from '../gamification/gamification.module';
import { UserActivityListener } from './listeners/user-activity.listener';
import { ProgressStatsService } from './progress-stats.service';
import { ProgressTrackingController } from './progress-tracking.controller';

/**
 * Todo lo que REACCIONA al progreso del alumno vive acá: los listeners del bus
 * de eventos y las métricas derivadas (racha, horas).
 *
 * La idea es que lesson-progress siga siendo "marcar una lección" y nada más.
 * XP, niveles, logros y el GET /me/dashboard entran en este módulo, como
 * listeners y servicios nuevos, sin volver a tocar el service de progreso.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LessonProgress,
      CourseEnrollment,
      // El dashboard lee los logros con sus repos en vez de inyectar
      // AchievementsService: ese service ya depende de este módulo (le pide
      // los conteos), y al revés serían dependencias circulares.
      Achievement,
      UserAchievement,
    ]),
    UserActivityModule,
    GamificationModule,
  ],
  controllers: [ProgressTrackingController],
  providers: [UserActivityListener, ProgressStatsService],
  exports: [ProgressStatsService],
})
export class ProgressTrackingModule { }
