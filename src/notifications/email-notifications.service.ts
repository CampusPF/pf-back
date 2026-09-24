import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Payment, PaymentType } from '../payments/entities/payment.entity';
import {
    Subscription,
    SubscriptionStatus,
} from '../subscriptions/entities/subscription.entity';
import { MailService } from '../mail/mail.service';
import { FRONT_ROUTES, frontendUrl } from '../mail/mail-templates';
import { MailTemplate } from '../mail/templates';
import { ResetTokenService } from '../auth/reset-token.service';

/** Lo que hace falta para mandar un mail y dejarlo registrado. */
export interface DeliveryRequest {
    user: Pick<User, 'id' | 'email' | 'name'>;
    /** Tipo de notificación (columna `type`), ej. 'course_enrolled'. */
    type: string;
    /**
     * Clave de idempotencia por usuario. Se le antepone "email:" para no
     * chocar con las notificaciones in_app que usan claves parecidas.
     */
    dedupeKey: string;
    template: MailTemplate;
    params: Record<string, unknown>;
    /** Título y mensaje cortos para la fila en `notification` (historial). */
    title: string;
    message: string;
    /** Ruta del front, relativa (ej. "/dashboard/mis-cursos"). */
    link?: string | null;
    /** Tag de Brevo, para filtrar logs y estadísticas por tipo de mail. */
    tag: string;
}

const WELCOME_TEMPLATE: Record<UserRole, MailTemplate> = {
    [UserRole.STUDENT]: MailTemplate.WELCOME_STUDENT,
    [UserRole.TEACHER]: MailTemplate.WELCOME_TEACHER,
    [UserRole.ADMIN]: MailTemplate.WELCOME_ADMIN,
};

/**
 * Arma y manda los mails de notificación (plantillas locales de
 * src/mail/templates) y deja cada envío registrado en la tabla `notification`
 * (channel 'email').
 *
 * Ese registro es también el candado anti-duplicados: antes de mandar se
 * inserta la fila con su dedupeKey (índice único parcial por usuario), y si
 * ya existía no se manda nada. Así un webhook de Stripe reintentado, un
 * evento repetido o dos corridas del cron no mandan el mismo mail dos veces.
 *
 * Nada de acá lanza hacia afuera: un mail que no sale se loguea y listo. El
 * hecho de negocio (la inscripción, el pago) ya ocurrió y no se deshace.
 */
@Injectable()
export class EmailNotificationsService {
    private readonly logger = new Logger(EmailNotificationsService.name);

    constructor(
        private readonly mail: MailService,
        private readonly config: ConfigService,
        private readonly resetTokens: ResetTokenService,
        @InjectRepository(Notification)
        private readonly notificationsRepository: Repository<Notification>,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(Course)
        private readonly coursesRepository: Repository<Course>,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
        @InjectRepository(Payment)
        private readonly paymentsRepository: Repository<Payment>,
        @InjectRepository(Subscription)
        private readonly subscriptionsRepository: Repository<Subscription>,
    ) { }

    // ------------------------------------------------------------------
    // Mails por evento
    // ------------------------------------------------------------------

    /**
     * Bienvenida, con una plantilla por rol.
     *
     * params: name, dashboardUrl, coursesUrl (estudiante), createCourseUrl
     * (docente), adminUrl (admin) y setPasswordUrl (sólo si la cuenta la creó
     * un admin: esa persona no eligió su contraseña).
     */
    async sendWelcome(userId: string, createdByAdmin: boolean): Promise<void> {
        const user = await this.usersRepository
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('user.id = :userId', { userId })
            .getOne();
        if (!user) return;

        const params: Record<string, unknown> = {
            name: user.name,
            dashboardUrl: this.url(FRONT_ROUTES.dashboard),
            coursesUrl: this.url(FRONT_ROUTES.courses),
            createCourseUrl: this.url(FRONT_ROUTES.newCourse),
            adminUrl: this.url(FRONT_ROUTES.admin),
        };
        if (createdByAdmin) {
            // Mismo token que "recuperar contraseña" (1 h, un solo uso).
            const token = this.resetTokens.generate(user.id, user.passwordHash ?? null);
            params.setPasswordUrl = this.url(FRONT_ROUTES.resetPassword(token));
        }

        await this.deliver({
            user,
            type: 'welcome',
            dedupeKey: 'welcome',
            template: WELCOME_TEMPLATE[user.role] ?? MailTemplate.WELCOME_STUDENT,
            params,
            title: '¡Bienvenido/a al Campus!',
            message: 'Tu cuenta ya está lista.',
            link: FRONT_ROUTES.dashboard,
            tag: `welcome-${user.role}`,
        });
    }

    /**
     * Inscripción: temario del curso y link a la primera lección.
     *
     * params: name, courseTitle, courseImageUrl, courseUrl, firstLessonUrl,
     * totalLessons, totalMinutes, modules[] { title, lessons[] { title,
     * duration } }.
     */
    async sendCourseEnrolled(
        userId: string,
        courseId: string,
        enrollmentId: string,
    ): Promise<void> {
        const [student, course] = await Promise.all([
            this.findUser(userId),
            this.loadCourseWithSyllabus(courseId),
        ]);
        if (!student || !course) return;

        const modules = course.modules ?? [];
        const lessons = modules.flatMap((m) => m.lessons ?? []);
        const firstLesson = lessons[0];

        await this.deliver({
            user: student,
            type: 'course_enrolled',
            dedupeKey: `enrolled:${enrollmentId}`,
            template: MailTemplate.COURSE_ENROLLED,
            params: {
                name: student.name,
                courseTitle: course.title,
                courseImageUrl: course.imageUrl ?? null,
                courseUrl: this.url(FRONT_ROUTES.course(course.slug)),
                // Sin lecciones todavía: se manda al detalle del curso.
                firstLessonUrl: firstLesson
                    ? this.url(FRONT_ROUTES.lesson(course.slug, firstLesson.id))
                    : this.url(FRONT_ROUTES.course(course.slug)),
                totalLessons: lessons.length,
                totalMinutes: lessons.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0),
                modules: modules.map((m) => ({
                    title: m.title,
                    lessons: (m.lessons ?? []).map((l) => ({
                        title: l.title,
                        duration: l.durationMinutes ?? 0,
                    })),
                })),
            },
            title: `Te inscribiste a "${course.title}"`,
            message: 'Ya podés empezar la primera lección.',
            link: firstLesson
                ? FRONT_ROUTES.lesson(course.slug, firstLesson.id)
                : FRONT_ROUTES.course(course.slug),
            tag: 'course-enrolled',
        });
    }

    /**
     * Aviso al docente: un alumno se inscribió a su curso.
     *
     * params: teacherName, studentName, courseTitle, totalStudents,
     * courseAdminUrl.
     */
    async sendTeacherNewStudent(
        userId: string,
        courseId: string,
        enrollmentId: string,
    ): Promise<void> {
        const [student, course] = await Promise.all([
            this.findUser(userId),
            this.coursesRepository.findOne({
                where: { id: courseId },
                relations: { instructor: true },
            }),
        ]);
        const teacher = course?.instructor;
        // El docente que se inscribe a su propio curso no se avisa a sí mismo.
        if (!student || !course || !teacher || teacher.id === student.id) return;

        const totalStudents = await this.enrollmentsRepository.count({
            where: { course: { id: courseId }, isActive: true },
        });

        await this.deliver({
            user: teacher,
            type: 'teacher_new_student',
            dedupeKey: `new-student:${enrollmentId}`,
            template: MailTemplate.TEACHER_NEW_STUDENT,
            params: {
                teacherName: teacher.name,
                studentName: student.name,
                courseTitle: course.title,
                totalStudents,
                courseAdminUrl: this.url(FRONT_ROUTES.manageCourse(course.id)),
            },
            title: `Nuevo alumno en "${course.title}"`,
            message: `${student.name} se inscribió a tu curso.`,
            link: FRONT_ROUTES.manageCourse(course.id),
            tag: 'teacher-new-student',
        });
    }

    /**
     * Pago confirmado: comprobante de compra de curso o confirmación de la
     * suscripción Premium, según el tipo de pago.
     *
     * Curso — params: name, courseTitle, amount, currency, paidAt, paymentId,
     * firstLessonUrl (link al curso), paymentsUrl.
     * Premium — params: name, planName, amount, currency, validUntil,
     * coursesUrl, paymentsUrl.
     */
    async sendPaymentSucceeded(paymentId: string): Promise<void> {
        const payment = await this.paymentsRepository.findOne({
            where: { id: paymentId },
            relations: { user: true, course: true },
        });
        if (!payment) return;

        const { user } = payment;
        const amount = this.formatMoney(payment.amountInCents, payment.currency);
        const currency = payment.currency.toUpperCase();
        const paymentsUrl = this.url(FRONT_ROUTES.payments);

        if (payment.type === PaymentType.COURSE) {
            const course = payment.course;
            await this.deliver({
                user,
                type: 'course_purchased',
                dedupeKey: `payment:${payment.id}`,
                template: MailTemplate.COURSE_PURCHASED,
                params: {
                    name: user.name,
                    courseTitle: course?.title ?? 'Curso',
                    amount,
                    currency,
                    paidAt: this.formatDate(payment.updatedAt ?? new Date()),
                    paymentId: payment.id,
                    firstLessonUrl: course
                        ? this.url(FRONT_ROUTES.course(course.slug))
                        : this.url(FRONT_ROUTES.myCourses),
                    paymentsUrl,
                },
                title: 'Compra confirmada',
                message: `Tu compra de "${course?.title ?? 'un curso'}" se acreditó.`,
                link: FRONT_ROUTES.payments,
                tag: 'course-purchased',
            });
            return;
        }

        const subscription = await this.subscriptionsRepository.findOne({
            where: { user: { id: user.id }, status: SubscriptionStatus.ACTIVE },
            order: { createdAt: 'DESC' },
        });

        await this.deliver({
            user,
            type: 'premium_confirmed',
            dedupeKey: `payment:${payment.id}`,
            template: MailTemplate.PREMIUM_CONFIRMED,
            params: {
                name: user.name,
                planName: 'Premium',
                amount,
                currency,
                validUntil: subscription ? this.formatDate(subscription.endDate) : null,
                coursesUrl: this.url(FRONT_ROUTES.courses),
                paymentsUrl,
            },
            title: '¡Ya sos Premium!',
            message: 'Tu suscripción Premium está activa.',
            link: FRONT_ROUTES.courses,
            tag: 'premium-confirmed',
        });
    }

    /**
     * Curso completado. params: name, courseTitle, coursesUrl, myCoursesUrl.
     * El certificado llega en su propio mail (sendCertificate).
     */
    async sendCourseCompleted(userId: string, courseId: string): Promise<void> {
        const [user, course] = await Promise.all([
            this.findUser(userId),
            this.coursesRepository.findOne({ where: { id: courseId } }),
        ]);
        if (!user || !course) return;

        await this.deliver({
            user,
            type: 'course_completed',
            dedupeKey: `completed:${courseId}`,
            template: MailTemplate.COURSE_COMPLETED,
            params: {
                name: user.name,
                courseTitle: course.title,
                coursesUrl: this.url(FRONT_ROUTES.courses),
                myCoursesUrl: this.url(FRONT_ROUTES.myCourses),
            },
            title: `¡Completaste "${course.title}"!`,
            message: 'Felicitaciones por terminar el curso.',
            link: FRONT_ROUTES.myCourses,
            tag: 'course-completed',
        });
    }

    /**
     * Certificado emitido, como enlace (no adjunto).
     * params: name, courseTitle, code, certificateUrl, verifyUrl.
     */
    async sendCertificate(userId: string, courseId: string, code: string): Promise<void> {
        const [user, course] = await Promise.all([
            this.findUser(userId),
            this.coursesRepository.findOne({ where: { id: courseId } }),
        ]);
        if (!user || !course) return;

        await this.deliver({
            user,
            type: 'certificate_issued',
            dedupeKey: `certificate:${code}`,
            template: MailTemplate.CERTIFICATE,
            params: {
                name: user.name,
                courseTitle: course.title,
                code,
                certificateUrl: this.url(FRONT_ROUTES.certificate(code)),
                verifyUrl: this.url(FRONT_ROUTES.verifyCertificate(code)),
            },
            title: 'Tu certificado está listo',
            message: `Certificado de "${course.title}".`,
            link: FRONT_ROUTES.certificate(code),
            tag: 'certificate',
        });
    }

    async sendRoleChanged(
        userId: string,
        previousRole: UserRole,
        newRole: UserRole,
    ): Promise<void> {
        const user = await this.findUser(userId);
        if (!user) return;

        const roleLabel: Record<UserRole, string> = {
            [UserRole.STUDENT]: 'estudiante',
            [UserRole.TEACHER]: 'docente',
            [UserRole.ADMIN]: 'administrador',
        };

        await this.deliver({
            user,
            type: 'role_changed',
            dedupeKey: `role-changed:${previousRole}->${newRole}`,
            template: MailTemplate.ROLE_CHANGED,
            params: {
                name: user.name,
                previousRole: roleLabel[previousRole],
                newRole: roleLabel[newRole],
                dashboardUrl: this.url(FRONT_ROUTES.dashboard),
            },
            title: 'Tu rol en Campus cambió',
            message: `Ahora sos ${roleLabel[newRole]}.`,
            link: FRONT_ROUTES.dashboard,
            tag: 'role-changed',
        });
    }

    async sendCourseBlockedByAdmin(
        instructorId: string,
        courseId: string,
        courseTitle: string,
        courseUpdatedAt: Date,
    ): Promise<void> {
        const instructor = await this.findUser(instructorId);
        if (!instructor) return;

        await this.deliver({
            user: instructor,
            type: 'course_blocked_by_admin',
            dedupeKey: `course-blocked:${courseId}:${courseUpdatedAt.getTime()}`,
            template: MailTemplate.COURSE_BLOCKED_BY_ADMIN,
            params: {
                name: instructor.name,
                courseTitle,
                coursesUrl: this.url(FRONT_ROUTES.myCourses),
            },
            title: `Tu curso "${courseTitle}" fue desactivado`,
            message: 'Un admin desactivó tu curso. Contactá al equipo de Campus si creés que es un error.',
            link: FRONT_ROUTES.myCourses,
            tag: 'course-blocked-by-admin',
        });
    }

    // ------------------------------------------------------------------
    // Envío + registro
    // ------------------------------------------------------------------

    /**
     * Manda el mail una sola vez por (usuario, dedupeKey).
     *
     * 1. Inserta la fila (ON CONFLICT DO NOTHING). Si no se insertó, ya se
     *    mandó (o se está mandando en otro request): no hace nada.
     * 2. Manda el mail y marca `sentAt`.
     * 3. Si el envío falla, borra la fila: el candado no puede quedar tomado
     *    por un mail que nunca salió.
     *
     * Devuelve true si el mail se mandó.
     */
    async deliver(req: DeliveryRequest): Promise<boolean> {
        const dedupeKey = `email:${req.dedupeKey}`;

        let notificationId: string | undefined;
        try {
            const result = await this.notificationsRepository
                .createQueryBuilder()
                .insert()
                .into(Notification)
                .values({
                    userId: req.user.id,
                    type: req.type,
                    channel: 'email',
                    title: req.title.slice(0, 150),
                    message: req.message,
                    link: req.link ?? null,
                    dedupeKey,
                })
                .orIgnore()
                .returning(['id'])
                .execute();
            notificationId = (result.raw as Array<{ id: string }>)[0]?.id;
        } catch (error) {
            this.logError(`registrar el mail "${req.type}"`, req.user.id, error);
            return false;
        }

        if (!notificationId) return false; // ya enviado

        try {
            await this.mail.sendTemplate(
                { email: req.user.email, name: req.user.name },
                req.template,
                req.params,
                [req.tag],
            );
            await this.notificationsRepository.update(notificationId, { sentAt: new Date() });
            return true;
        } catch (error) {
            this.logError(`mandar el mail "${req.type}"`, req.user.id, error);
            await this.notificationsRepository.delete(notificationId).catch(() => undefined);
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Link absoluto al front, para usar en los params de las plantillas. */
    url(path: string): string {
        return frontendUrl(this.config, path);
    }

    private findUser(id: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { id } });
    }

    /**
     * Curso con sus módulos y lecciones ACTIVOS, en el orden del temario
     * (módulo y después lección). `content`/`videoUrl` no vienen: son
     * select:false en la entidad y el mail no los necesita.
     */
    private loadCourseWithSyllabus(courseId: string): Promise<Course | null> {
        return this.coursesRepository
            .createQueryBuilder('course')
            .leftJoinAndSelect('course.modules', 'module', 'module.isActive = true')
            .leftJoinAndSelect('module.lessons', 'lesson', 'lesson.isActive = true')
            .where('course.id = :courseId', { courseId })
            .orderBy('module.order', 'ASC')
            .addOrderBy('lesson.order', 'ASC')
            .getOne();
    }

    private formatMoney(amountInCents: number, currency: string): string {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amountInCents / 100);
    }

    private formatDate(date: Date): string {
        return new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'long',
            timeZone: this.config.get<string>('REMINDER_TZ') ?? 'America/Argentina/Buenos_Aires',
        }).format(date);
    }

    private logError(action: string, userId: string, error: unknown): void {
        this.logger.error(
            `No se pudo ${action} para el usuario ${userId}`,
            error instanceof Error ? error.stack : String(error),
        );
    }
}
