import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { DataSource, Repository } from 'typeorm';
import { PushService } from './push.service';
import { CoursePushReminder } from './entities/course-push-reminder.entity';

interface InactiveEnrollmentRow {
    user_id: string;
    course_id: string;
    course_title: string;
    course_slug: string;
    days_inactive: number;
}

export interface CoursePushRemindersRunResult {
    candidates: number;
    sent: number;
    skipped: number;
}

const CRON_JOB_NAME = 'course-push-reminders';

@Injectable()
export class CoursePushRemindersService implements OnModuleInit {
    private readonly logger = new Logger(CoursePushRemindersService.name);

    constructor(
        private readonly config: ConfigService,
        private readonly scheduler: SchedulerRegistry,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(CoursePushReminder)
        private readonly remindersRepository: Repository<CoursePushReminder>,
        private readonly pushService: PushService,
    ) { }

    onModuleInit(): void {
        if (this.config.get<string>('NODE_ENV') === 'test') return;

        const cronTime = this.config.get<string>('COURSE_PUSH_CRON') ?? '0 19 */3 * *';
        const timeZone =
            this.config.get<string>('COURSE_PUSH_TZ') ?? 'America/Argentina/Buenos_Aires';

        const job = CronJob.from({
            cronTime,
            timeZone,
            onTick: () => {
                void this.run().catch((error: unknown) => {
                    this.logger.error(
                        'Falló la corrida de recordatorios push de cursos',
                        error instanceof Error ? error.stack : String(error),
                    );
                });
            },
        });
        this.scheduler.addCronJob(CRON_JOB_NAME, job);
        job.start();
        this.logger.log(
            `Recordatorios push de cursos programados: "${cronTime}" (${timeZone})`,
        );
    }

    /**
     * Encuentra alumnos con cursos inactivos, manda UN push por alumno (el
     * curso más inactivo), y registra el envío para no repetir antes de
     * COURSE_PUSH_MIN_INTERVAL_DAYS días.
     */
    async run(): Promise<CoursePushRemindersRunResult> {
        const inactivityDays = this.config.get<number>('STUDENT_INACTIVITY_DAYS') ?? 7;
        const minIntervalDays =
            this.config.get<number>('COURSE_PUSH_MIN_INTERVAL_DAYS') ?? 3;

        const rows: InactiveEnrollmentRow[] = await this.dataSource.query(
            `
            SELECT u.id    AS user_id,
                   c.id    AS course_id,
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
               AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id)
               AND COALESCE(e.last_accessed_at, e.enrolled_at)
                   < now() - make_interval(days => $1)
             ORDER BY u.id, days_inactive DESC
            `,
            [inactivityDays],
        );

        const byUser = new Map<string, InactiveEnrollmentRow[]>();
        for (const row of rows) {
            const userRows = byUser.get(row.user_id) ?? [];
            userRows.push(row);
            byUser.set(row.user_id, userRows);
        }

        const cutoff = new Date(Date.now() - minIntervalDays * 24 * 60 * 60 * 1000);
        let sent = 0;
        let skipped = 0;

        for (const [userId, courses] of byUser) {
            let selectedCourse: InactiveEnrollmentRow | undefined;
            let existingReminder: CoursePushReminder | null = null;
            for (const course of courses) {
                const reminder = await this.remindersRepository.findOne({
                    where: { userId, courseId: course.course_id },
                });
                if (!reminder || reminder.lastSentAt <= cutoff) {
                    selectedCourse = course;
                    existingReminder = reminder;
                    break;
                }
            }
            if (!selectedCourse) {
                skipped++;
                continue;
            }

            const body = `Tu curso "${selectedCourse.course_title}" no registra actividad hace ${selectedCourse.days_inactive} días.`;
            await this.pushService.sendToUser(userId, {
                title: 'Sigamos aprendiendo',
                body,
                url: '/dashboard/mis-cursos',
                tag: `course-reminder-${selectedCourse.course_id}`,
                icon: '/logo-campus.png',
            });

            const now = new Date();
            if (existingReminder) {
                existingReminder.lastSentAt = now;
                await this.remindersRepository.save(existingReminder);
            } else {
                await this.remindersRepository.save(
                    this.remindersRepository.create({
                        userId,
                        courseId: selectedCourse.course_id,
                        lastSentAt: now,
                    }),
                );
            }
            sent++;
        }

        this.logger.log(
            `Recordatorios push de cursos: ${sent} enviados, ${skipped} salteados, ${byUser.size} candidatos`,
        );
        return { candidates: byUser.size, sent, skipped };
    }
}
