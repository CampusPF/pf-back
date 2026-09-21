import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    EVENTS,
    LessonCompletedEvent,
    CourseCompletedEvent,
    CertificateIssuedEvent,
    QuizPassedEvent,
} from '../events';
import { AchievementsService } from './achievements.service';

/**
 * Dispara la evaluación de logros cuando pasa algo que podría desbloquear uno.
 *
 * Se evalúa TODO el set pendiente en cada evento, no sólo lo relacionado con
 * lo que acaba de pasar: completar una lección puede desbloquear un logro de
 * racha o de nivel, no sólo uno de lecciones.
 */
@Injectable()
export class AchievementsListener {
    private readonly logger = new Logger(AchievementsListener.name);

    constructor(private readonly achievementsService: AchievementsService) { }

    @OnEvent(EVENTS.LESSON_COMPLETED)
    async onLessonCompleted(event: LessonCompletedEvent): Promise<void> {
        await this.evaluate(event.userId);
    }

    @OnEvent(EVENTS.COURSE_COMPLETED)
    async onCourseCompleted(event: CourseCompletedEvent): Promise<void> {
        await this.evaluate(event.userId);
    }

    @OnEvent(EVENTS.CERTIFICATE_ISSUED)
    async onCertificateIssued(event: CertificateIssuedEvent): Promise<void> {
        await this.evaluate(event.userId);
    }

    @OnEvent(EVENTS.QUIZ_PASSED)
    async onQuizPassed(event: QuizPassedEvent): Promise<void> {
        await this.evaluate(event.userId);
    }

    /**
     * El error se traga y se loguea: la lección ya quedó completada, y que
     * falle un logro no puede romperle el flujo al alumno. Mismo criterio que
     * los listeners de racha y XP.
     */
    private async evaluate(userId: string): Promise<void> {
        try {
            await this.achievementsService.evaluateForUser(userId);
        } catch (error) {
            this.logger.error(
                `No se pudieron evaluar los logros del usuario ${userId}`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }
}
