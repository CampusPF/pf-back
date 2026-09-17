import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, LessonCompletedEvent } from '../../events';
import { UserActivityService } from '../../user-activity/user-activity.service';

/**
 * Traduce "se completó una lección" en "este usuario estudió hoy".
 *
 * Es el primer listener del bus; XP, logros y mails van a ser hermanos de este
 * archivo, no más ifs dentro de LessonProgressService.
 */
@Injectable()
export class UserActivityListener {
  private readonly logger = new Logger(UserActivityListener.name);

  constructor(private readonly userActivityService: UserActivityService) { }

  @OnEvent(EVENTS.LESSON_COMPLETED)
  async handleLessonCompleted(event: LessonCompletedEvent): Promise<void> {
    try {
      await this.userActivityService.registerActivityToday(event.userId);
    } catch (error) {
      /* Se traga el error a propósito. La lección YA quedó completada: ese es
         el hecho que le importa al alumno. Que falle el registro de la racha
         no puede devolverle un 500 sobre una operación que salió bien. Queda
         el log para verlo. */
      this.logger.error(
        `No se pudo registrar la actividad diaria del usuario ${event.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
