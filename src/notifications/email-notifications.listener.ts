import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    EVENTS,
    UserRegisteredEvent,
    CourseEnrolledEvent,
    PaymentSucceededEvent,
    CourseCompletedEvent,
    CertificateIssuedEvent,
} from '../events';
import { EmailNotificationsService } from './email-notifications.service';

/**
 * Traduce eventos de dominio en mails. Toda la lógica (qué plantilla, qué
 * params, dedupe) vive en EmailNotificationsService; acá sólo se enruta.
 *
 * `async: true`: el listener corre fuera del flujo de quien emite. Un
 * registro, una inscripción o un webhook de Stripe no esperan a Brevo, y un
 * mail que falla no les devuelve un error.
 */
@Injectable()
export class EmailNotificationsListener {
    private readonly logger = new Logger(EmailNotificationsListener.name);

    constructor(private readonly emails: EmailNotificationsService) { }

    @OnEvent(EVENTS.USER_REGISTERED, { async: true })
    async onUserRegistered(event: UserRegisteredEvent): Promise<void> {
        await this.safely('bienvenida', event.userId, () =>
            this.emails.sendWelcome(event.userId, event.createdByAdmin),
        );
    }

    /** Dos mails: al alumno (temario) y al docente del curso. */
    @OnEvent(EVENTS.COURSE_ENROLLED, { async: true })
    async onCourseEnrolled(event: CourseEnrolledEvent): Promise<void> {
        await Promise.all([
            this.safely('inscripción', event.userId, () =>
                this.emails.sendCourseEnrolled(event.userId, event.courseId, event.enrollmentId),
            ),
            this.safely('aviso al docente', event.userId, () =>
                this.emails.sendTeacherNewStudent(event.userId, event.courseId, event.enrollmentId),
            ),
        ]);
    }

    @OnEvent(EVENTS.PAYMENT_SUCCEEDED, { async: true })
    async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
        await this.safely('pago confirmado', event.paymentId, () =>
            this.emails.sendPaymentSucceeded(event.paymentId),
        );
    }

    @OnEvent(EVENTS.COURSE_COMPLETED, { async: true })
    async onCourseCompleted(event: CourseCompletedEvent): Promise<void> {
        await this.safely('curso completado', event.userId, () =>
            this.emails.sendCourseCompleted(event.userId, event.courseId),
        );
    }

    @OnEvent(EVENTS.CERTIFICATE_ISSUED, { async: true })
    async onCertificateIssued(event: CertificateIssuedEvent): Promise<void> {
        await this.safely('certificado', event.userId, () =>
            this.emails.sendCertificate(event.userId, event.courseId, event.code),
        );
    }

    /**
     * deliver() ya no lanza, pero cargar los datos (usuario, curso) sí puede.
     * Un listener async que lanza termina en un unhandled rejection.
     */
    private async safely(what: string, ref: string, fn: () => Promise<void>): Promise<void> {
        try {
            await fn();
        } catch (error) {
            this.logger.error(
                `Falló el mail de ${what} (${ref})`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }
}
