import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';
import { UserActivityModule } from '../user-activity/user-activity.module';
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
  imports: [TypeOrmModule.forFeature([LessonProgress]), UserActivityModule],
  controllers: [ProgressTrackingController],
  providers: [UserActivityListener, ProgressStatsService],
  exports: [ProgressStatsService],
})
export class ProgressTrackingModule { }
