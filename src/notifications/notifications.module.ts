import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { EmailNotificationsService } from './email-notifications.service';
import { EmailNotificationsListener } from './email-notifications.listener';
import { RemindersService } from './reminders.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { NotificationsController } from './notifications.controller';

/**
 * Notificaciones por mail (HTML generado en src/mail/templates):
 *  - EmailNotificationsListener: mails disparados por eventos de dominio
 *    (bienvenida, inscripción, pago, curso completado, certificado).
 *  - RemindersService: recordatorios semanales por cron.
 *
 * Lee las entidades de otros módulos por repositorio, sin importar sus
 * services: sólo necesita datos para armar los mails, no sus reglas.
 * AuthModule aporta JwtService (tokens de baja) y ResetTokenService (link
 * para definir la contraseña en la bienvenida de cuentas creadas por admin).
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            Notification,
            User,
            Course,
            CourseEnrollment,
            Payment,
            Subscription,
        ]),
        MailModule,
        AuthModule,
    ],
    controllers: [NotificationsController],
    providers: [
        EmailNotificationsService,
        EmailNotificationsListener,
        RemindersService,
        UnsubscribeTokenService,
    ],
})
export class NotificationsModule { }
