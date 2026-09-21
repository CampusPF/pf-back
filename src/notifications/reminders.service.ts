import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { DataSource } from 'typeorm';
import { EmailNotificationsService } from './email-notifications.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { FRONT_ROUTES } from '../mail/mail-templates';
import { MailTemplate } from '../mail/templates';

/** Fila de la consulta de alumnos inactivos: una por (alumno, curso). */
interface InactiveEnrollmentRow {
    user_id: string;
    name: string;
    email: string;
    course_title: string;
    course_slug: string;
    days_inactive: number;
}

interface InactiveTeacherRow {
    user_id: string;
    name: string;
    email: string;
    days_since_last_course: number;
}

export interface RemindersRunResult {
    students: number;
    teachers: number;
}

const CRON_JOB_NAME = 'weekly-reminders';

/**
 * Recordatorios semanales por mail:
 *  - Alumno: "llevás X días sin entrar a <curso>". UN mail por alumno con
 *    todos sus cursos sin actividad, no uno por curso.
 *  - Docente: "llevás X días sin crear un curso".
 *
 * El cron se registra a mano (SchedulerRegistry) y no con @Cron(), porque la
 * expresión y la zona horaria salen de ConfigService (REMINDER_CRON /
 * REMINDER_TZ), que no existe todavía cuando se evalúan los decoradores.
 *
 * Idempotente por semana: la dedupeKey lleva el año y la semana ISO, así que
 * si el cron corre dos veces (reinicio, varias instancias, disparo manual)
 * nadie recibe el mismo recordatorio dos veces en la semana.
 */
@Injectable()
export class RemindersService implements OnModuleInit {
    private readonly logger = new Logger(RemindersService.name);

    constructor(
        private readonly config: ConfigService,
        private readonly scheduler: SchedulerRegistry,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly emails: EmailNotificationsService,
        private readonly unsubscribeTokens: UnsubscribeTokenService,
    ) { }

    onModuleInit(): void {
        // En los tests no se programa nada.
        if (this.config.get<string>('NODE_ENV') === 'test') return;

        const cronTime = this.config.get<string>('REMINDER_CRON') ?? '0 10 * * 1';
        const timeZone =
            this.config.get<string>('REMINDER_TZ') ?? 'America/Argentina/Buenos_Aires';

        const job = CronJob.from({
            cronTime,
            timeZone,
            onTick: () => {
                void this.runAll().catch((error: unknown) => {
                    this.logger.error(
                        'Falló la corrida de recordatorios',
                        error instanceof Error ? error.stack : String(error),
                    );
                });
            },
        });
        this.scheduler.addCronJob(CRON_JOB_NAME, job);
        job.start();
        this.logger.log(`Recordatorios programados: "${cronTime}" (${timeZone})`);
    }

    /** Corre los dos recordatorios. Lo usa el cron y el endpoint de admin. */
    async runAll(): Promise<RemindersRunResult> {
        const students = await this.runStudentReminders();
        const teachers = await this.runTeacherReminders();
        this.logger.log(`Recordatorios enviados: ${students} alumnos, ${teachers} docentes`);
        return { students, teachers };
    }

    /**
     * Alumnos con cursos activos sin terminar y sin entrar hace más de
     * STUDENT_INACTIVITY_DAYS. "Entrar" = abrir una lección (lastAccessedAt);
     * si nunca entró se cuenta desde la inscripción.
     *
     * params: name, courses[] { title, daysInactive, url }, maxDaysInactive,
     * unsubscribeUrl.
     */
    async runStudentReminders(): Promise<number> {
        const days = this.config.get<number>('STUDENT_INACTIVITY_DAYS') ?? 7;

        const rows: InactiveEnrollmentRow[] = await this.dataSource.query(
            `
            SELECT u.id    AS user_id,
                   u.name  AS name,
                   u.email AS email,
                   c.title AS course_title,
                   c.slug  AS course_slug,
                   EXTRACT(DAY FROM now() - COALESCE(e.last_accessed_at, e.enrolled_at))::int
                           AS days_inactive
              FROM course_enrollments e
              JOIN users   u ON u.id = e."studentId"
              JOIN courses c ON c.id = e."courseId"
             WHERE e."isActive" = true
               AND e.completed_at IS NULL
               AND c."isActive" = true
               AND u.status = 'active'
               AND u.email_reminders_enabled = true
               AND COALESCE(e.last_accessed_at, e.enrolled_at) < now() - make_interval(days => $1)
             ORDER BY u.id, days_inactive DESC
            `,
            [days],
        );

        const byUser = new Map<string, InactiveEnrollmentRow[]>();
        for (const row of rows) {
            const list = byUser.get(row.user_id) ?? [];
            list.push(row);
            byUser.set(row.user_id, list);
        }

        const week = isoWeekKey(new Date());
        let sent = 0;

        // De a uno: el plan gratuito de Brevo tiene tope diario (300) y no
        // conviene ráfagas. Los que no entren hoy quedan para la próxima
        // corrida de la semana (la dedupeKey no se toma si el envío falla).
        for (const [userId, courses] of byUser) {
            const { name, email } = courses[0];
            const ok = await this.emails.deliver({
                user: { id: userId, name, email },
                type: 'student_reminder',
                dedupeKey: `student-reminder:${week}`,
                template: MailTemplate.STUDENT_REMINDER,
                params: {
                    name,
                    maxDaysInactive: courses[0].days_inactive,
                    courses: courses.map((c) => ({
                        title: c.course_title,
                        daysInactive: c.days_inactive,
                        url: this.emails.url(FRONT_ROUTES.course(c.course_slug)),
                    })),
                    myCoursesUrl: this.emails.url(FRONT_ROUTES.myCourses),
                    unsubscribeUrl: this.unsubscribeUrl(userId),
                },
                title: 'Te extrañamos en el Campus',
                message: `Llevás ${courses[0].days_inactive} días sin entrar a "${courses[0].course_title}".`,
                link: FRONT_ROUTES.myCourses,
                tag: 'student-reminder',
            });
            if (ok) sent++;
        }
        return sent;
    }

    /**
     * Docentes activos que no crean un curso hace más de
     * TEACHER_INACTIVITY_DAYS. Si nunca crearon uno, se cuenta desde el alta
     * de la cuenta.
     *
     * params: name, daysSinceLastCourse, hasCourses, createCourseUrl,
     * unsubscribeUrl.
     */
    async runTeacherReminders(): Promise<number> {
        const days = this.config.get<number>('TEACHER_INACTIVITY_DAYS') ?? 30;

        const rows: Array<InactiveTeacherRow & { course_count: number }> =
            await this.dataSource.query(
                `
                SELECT u.id    AS user_id,
                       u.name  AS name,
                       u.email AS email,
                       COUNT(c.id)::int AS course_count,
                       EXTRACT(DAY FROM now() - COALESCE(MAX(c."createdAt"), u."createdAt"))::int
                               AS days_since_last_course
                  FROM users u
                  LEFT JOIN courses c ON c."instructorId" = u.id
                 WHERE u.role = 'teacher'
                   AND u.status = 'active'
                   AND u.email_reminders_enabled = true
                 GROUP BY u.id
                HAVING COALESCE(MAX(c."createdAt"), u."createdAt") < now() - make_interval(days => $1)
                `,
                [days],
            );

        const week = isoWeekKey(new Date());
        let sent = 0;

        for (const row of rows) {
            const ok = await this.emails.deliver({
                user: { id: row.user_id, name: row.name, email: row.email },
                type: 'teacher_reminder',
                dedupeKey: `teacher-reminder:${week}`,
                template: MailTemplate.TEACHER_REMINDER,
                params: {
                    name: row.name,
                    daysSinceLastCourse: row.days_since_last_course,
                    hasCourses: row.course_count > 0,
                    createCourseUrl: this.emails.url(FRONT_ROUTES.newCourse),
                    unsubscribeUrl: this.unsubscribeUrl(row.user_id),
                },
                title: '¿Qué vas a enseñar ahora?',
                message: `Llevás ${row.days_since_last_course} días sin crear un curso.`,
                link: FRONT_ROUTES.newCourse,
                tag: 'teacher-reminder',
            });
            if (ok) sent++;
        }
        return sent;
    }

    /**
     * Apunta directo al back: GET /notifications/unsubscribe?token=… responde
     * una página simple, sin depender de que el front tenga una ruta.
     */
    private unsubscribeUrl(userId: string): string {
        const apiBase = (
            this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000'
        ).replace(/\/$/, '');
        const token = encodeURIComponent(this.unsubscribeTokens.generate(userId));
        return `${apiBase}/notifications/unsubscribe?token=${token}`;
    }
}

/** "2026-W38": año y semana ISO 8601 (la semana empieza el lunes). */
export function isoWeekKey(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // jueves de la misma semana
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
