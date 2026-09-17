import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserActivity } from './entities/user-activity.entity';
import { UserActivityService } from './user-activity.service';

/**
 * Dueño de la tabla user_activity y del cálculo de racha.
 *
 * No tiene controller ni listeners: solo guarda y calcula. Quién dispara el
 * registro (el listener de eventos) y quién lo muestra (el endpoint) viven en
 * progress-tracking, así este módulo no depende de lesson-progress ni de auth.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserActivity])],
  providers: [UserActivityService],
  exports: [UserActivityService],
})
export class UserActivityModule { }
