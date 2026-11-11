import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { DataSource, In, Not, Repository } from 'typeorm';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LessonsAccessService } from '../lessons/lessons-access.service';
import { User, UserRole } from '../users/entities/user.entity';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailNotificationsService } from '../notifications/email-notifications.service';
import { MailTemplate } from '../mail/templates';
import { FRONT_ROUTES } from '../mail/mail-templates';
import { GolondrinaAutomation } from './entities/golondrina-automation.entity';
import {
    GolondrinaAction,
    GolondrinaChannel,
    Message,
    messageFor,
    nextAfterRun,
    scheduleFor,
    summarizeLesson,
} from './golondrina.actions';

export interface AutomationView {
    id: string;
    lessonId: string;
    action: GolondrinaAction;
    channel: GolondrinaChannel;
    status: GolondrinaAutomation['status'];
    nextRunAt: Date | null;
    runsLeft: number;
    runsDone: number;
    lastSentAt: Date | null;
    /** Sólo en la respuesta de crear: el canal que se usó de verdad (ver deliver). */
    deliveredVia?: GolondrinaChannel | null;
}

export interface ChannelsView {
    /** Hay VAPID y el usuario tiene al menos un navegador suscripto. */
    push: boolean;
    email: boolean;
    in_app: boolean;
}

export interface GolondrinaRunResult {
    due: number;
    sent: number;
    failed: number;
}

/** Lo que el runner necesita de cada automatización, en una sola consulta. */
interface DueRow {
    id: string;
    user_id: string;
    lesson_id: string;
    action: GolondrinaAction;
    channel: GolondrinaChannel;
    runs_left: number;
    runs_done: number;
    lesson_title: string;
    course_slug: string;
}

type Teller = Pick<User, 'id' | 'email' | 'name'>;

const CRON_JOB_NAME = 'golondrina-runner';
const BATCH = 200;

/**
 * Golondrina de verdad: guarda las automatizaciones que el alumno activa desde
 * el asistente de cada lección y las manda por el canal que eligió.
 *
 *  - Las programadas («recordar», «plan») las corre `runDue`, con un cron
 *    interno cada 5 minutos y el disparador externo POST /tasks/golondrina
 *    (el plan gratis de Render duerme: ver TasksController).
 *  - «resumen» sale en el momento, al crearla.
 *  - «docente» espera un evento: el docente le escribe al alumno por el chat
 *    o le responde en el foro (ver GolondrinaListener).
 *
 * Canales: push (celular), email y in_app (campanita). Si el alumno eligió
 * push pero no tiene ningún navegador suscripto, el aviso cae en la
 * campanita: un aviso que no llega a ningún lado es peor que uno en otro canal.
 */
@Injectable()
export class GolondrinaService implements OnModuleInit {
    private readonly logger = new Logger(GolondrinaService.name);

    constructor(
        private readonly config: ConfigService,
        private readonly scheduler: SchedulerRegistry,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(GolondrinaAutomation)
        private readonly automations: Repository<GolondrinaAutomation>,
        @InjectRepository(Lesson)
        private readonly lessons: Repository<Lesson>,
        @InjectRepository(User)
        private readonly users: Repository<User>,
        private readonly access: LessonsAccessService,
        private readonly push: PushService,
        private readonly inApp: NotificationsService,
        private readonly emails: EmailNotificationsService,
    ) { }

    onModuleInit(): void {
        if (this.config.get<string>('NODE_ENV') === 'test') return;
        const cronTime = this.config.get<string>('GOLONDRINA_CRON') ?? '*/5 * * * *';
        const job = CronJob.from({
            cronTime,
            timeZone: 'UTC',
            onTick: () => {
                void this.runDue().catch((error: unknown) => {
                    this.logger.error(
                        'Falló la corrida de Golondrina',
                        error instanceof Error ? error.stack : String(error),
                    );
                });
            },
        });
        this.scheduler.addCronJob(CRON_JOB_NAME, job);
        job.start();
        this.logger.log(`Golondrina programada: "${cronTime}" (UTC)`);
    }

    // ------------------------------------------------------------------
    // API del alumno
    // ------------------------------------------------------------------

    async channels(userId: string): Promise<ChannelsView> {
        return { push: await this.push.canReach(userId), email: true, in_app: true };
    }

    async listMine(userId: string, lessonId?: string): Promise<AutomationView[]> {
        const rows = await this.automations.find({
            where: { userId, status: Not('cancelled'), ...(lessonId ? { lessonId } : {}) },
            order: { updatedAt: 'DESC' },
        });
        return rows.map(toView);
    }

    /**
     * Activa (o reactiva) una acción en una lección. Exige el mismo acceso que
     * el contenido de la lección: Golondrina no es una forma gratis de recibir
     * el resumen de una lección paga.
     */
    async create(
        actor: { id: string; role?: UserRole },
        lessonId: string,
        action: GolondrinaAction,
        channel: GolondrinaChannel,
        now = new Date(),
    ): Promise<AutomationView> {
        const lesson = await this.lessons
            .createQueryBuilder('lesson')
            .addSelect('lesson.content')
            .leftJoinAndSelect('lesson.module', 'module')
            .leftJoinAndSelect('module.course', 'course')
            .leftJoinAndSelect('course.instructor', 'instructor')
            .where('lesson.id = :lessonId', { lessonId })
            .getOne();
        if (!lesson || !lesson.module?.course) throw new NotFoundException('Lección no encontrada.');

        const course = lesson.module.course;
        const allowed = await this.access.canAccessCourseContent(actor, course, lesson);
        if (!allowed) throw new ForbiddenException('No tenés acceso a esta lección.');

        const { nextRunAt, runsLeft } = scheduleFor(action, now);
        const existing = await this.automations.findOne({ where: { userId: actor.id, lessonId, action } });
        const row = existing ?? this.automations.create({ userId: actor.id, lessonId, action });
        Object.assign(row, { channel, status: 'active', nextRunAt, runsLeft, runsDone: 0, lastSentAt: null });
        const saved = await this.automations.save(row);

        if (action !== 'resumen') return toView(saved);

        // El resumen sale ya: no espera al runner.
        const user = await this.users.findOne({ where: { id: actor.id } });
        if (!user) throw new NotFoundException('Usuario no encontrado.');
        const message = messageFor('resumen', lesson.title, { summary: summarizeLesson(lesson.content) });
        const via = await this.deliver(user, saved, message, FRONT_ROUTES.lesson(course.slug, lesson.id), now);
        Object.assign(saved, finishRun(saved, now, via !== null));
        const done = await this.automations.save(saved);
        return { ...toView(done), deliveredVia: via };
    }

    async updateChannel(userId: string, id: string, channel: GolondrinaChannel): Promise<AutomationView> {
        const row = await this.ownedOrFail(userId, id);
        row.channel = channel;
        return toView(await this.automations.save(row));
    }

    async cancel(userId: string, id: string): Promise<void> {
        const row = await this.ownedOrFail(userId, id);
        row.status = 'cancelled';
        row.nextRunAt = null;
        await this.automations.save(row);
    }

    // ------------------------------------------------------------------
    // Runner
    // ------------------------------------------------------------------

    /**
     * Manda todo lo que ya tocaba. Cada fila se «reclama» primero (next_run_at
     * a NULL con FOR UPDATE SKIP LOCKED): si el cron interno y el externo
     * corren a la vez, ninguna sale dos veces.
     */
    async runDue(now = new Date()): Promise<GolondrinaRunResult> {
        const rows: DueRow[] = await this.dataSource.query(
            `
            UPDATE golondrina_automations ga
               SET next_run_at = NULL, updated_at = now()
              FROM lessons l
              JOIN course_modules m ON m.id = l."moduleId"
              JOIN courses c        ON c.id = m."courseId"
             WHERE ga.lesson_id = l.id
               AND ga.id IN (
                   SELECT id FROM golondrina_automations
                    WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= $1
                    ORDER BY next_run_at
                    LIMIT ${BATCH}
                    FOR UPDATE SKIP LOCKED)
         RETURNING ga.id, ga.user_id, ga.lesson_id, ga.action, ga.channel, ga.runs_left, ga.runs_done,
                   l.title AS lesson_title, c.slug AS course_slug
            `,
            [now],
        );
        if (rows.length === 0) return { due: 0, sent: 0, failed: 0 };

        const users = await this.users.find({ where: { id: In([...new Set(rows.map((r) => r.user_id))]) } });
        const byId = new Map(users.map((u) => [u.id, u]));
        let sent = 0;
        let failed = 0;

        for (const r of rows) {
            const user = byId.get(r.user_id);
            const row = await this.automations.findOne({ where: { id: r.id } });
            if (!user || !row) continue;
            const message = messageFor(r.action, r.lesson_title, { runIndex: r.runs_done });
            const via = await this.deliver(user, row, message, FRONT_ROUTES.lesson(r.course_slug, r.lesson_id), now);
            Object.assign(row, finishRun(row, now, via !== null));
            await this.automations.save(row);
            if (via) sent++;
            else failed++;
        }

        this.logger.log(`Golondrina: ${sent} avisos enviados, ${failed} fallidos, ${rows.length} pendientes.`);
        return { due: rows.length, sent, failed };
    }

    /**
     * El docente le contestó al alumno (chat o foro). Si el alumno activó
     * «avisame si responde» en alguna lección de un curso de ESE docente, le
     * llega el aviso. `refId` (mensaje o post) evita mandar dos veces lo mismo.
     */
    async onTeacherReplied(studentId: string, teacherId: string, ref: { kind: 'chat' | 'forum'; id: string; threadId?: string }): Promise<boolean> {
        if (studentId === teacherId) return false;
        const rows: Array<{ id: string; lesson_title: string }> = await this.dataSource.query(
            `
            SELECT ga.id, l.title AS lesson_title
              FROM golondrina_automations ga
              JOIN lessons l        ON l.id = ga.lesson_id
              JOIN course_modules m ON m.id = l."moduleId"
              JOIN courses c        ON c.id = m."courseId"
             WHERE ga.user_id = $1
               AND ga.action = 'docente'
               AND ga.status = 'active'
               AND c."instructorId" = $2
             ORDER BY ga.updated_at DESC
             LIMIT 1
            `,
            [studentId, teacherId],
        );
        if (rows.length === 0) return false;

        const [user, row] = await Promise.all([
            this.users.findOne({ where: { id: studentId } }),
            this.automations.findOne({ where: { id: rows[0].id } }),
        ]);
        if (!user || !row) return false;

        const link = ref.kind === 'forum' && ref.threadId ? `/dashboard/foros/hilo/${ref.threadId}` : '/dashboard/chats';
        const via = await this.deliver(user, row, messageFor('docente', rows[0].lesson_title), link, new Date(), `${ref.kind}:${ref.id}`);
        if (via) {
            row.runsDone += 1;
            row.lastSentAt = new Date();
            await this.automations.save(row);
        }
        return via !== null;
    }

    // ------------------------------------------------------------------
    // Envío
    // ------------------------------------------------------------------

    /**
     * Manda el aviso por el canal de la automatización y devuelve el que se
     * usó de verdad (null si no salió por ninguno). Nada lanza hacia afuera.
     */
    async deliver(
        user: Teller,
        row: Pick<GolondrinaAutomation, 'id' | 'channel' | 'runsDone' | 'action'>,
        message: Message,
        link: string,
        now: Date,
        dedupe = String(row.runsDone),
    ): Promise<GolondrinaChannel | null> {
        let channel = row.channel;
        if (channel === 'push' && !(await this.push.canReach(user.id))) channel = 'in_app';

        try {
            if (channel === 'push') {
                await this.push.sendToUser(user.id, {
                    title: message.title,
                    body: message.body,
                    url: link,
                    tag: `golondrina-${row.id}`,
                    icon: '/logo-campus.png',
                });
                return 'push';
            }
            if (channel === 'email') {
                const ok = await this.emails.deliver({
                    user,
                    type: 'golondrina',
                    dedupeKey: `golondrina:${row.id}:${dedupe}`,
                    template: MailTemplate.GOLONDRINA,
                    params: {
                        name: user.name,
                        title: message.title,
                        message: message.body,
                        items: message.items,
                        ctaLabel: row.action === 'docente' ? 'Ver la respuesta' : 'Abrir la lección',
                        ctaUrl: this.emails.url(link),
                    },
                    title: message.title,
                    message: message.body,
                    link,
                    tag: `golondrina-${row.action}`,
                });
                return ok ? 'email' : null;
            }
            await this.inApp.create({ userId: user.id, type: 'golondrina', title: message.title, message: message.body, link });
            return 'in_app';
        } catch (error) {
            this.logger.warn(
                `No salió el aviso de Golondrina ${row.id} (${channel}) a las ${now.toISOString()}: ` +
                (error instanceof Error ? error.message : String(error)),
            );
            return null;
        }
    }

    private async ownedOrFail(userId: string, id: string): Promise<GolondrinaAutomation> {
        const row = await this.automations.findOne({ where: { id, userId } });
        if (!row) throw new NotFoundException('Automatización no encontrada.');
        return row;
    }
}

/**
 * Cómo queda la fila después de una corrida programada. Si falló, se
 * reintenta en 15 minutos sin gastar la corrida.
 */
export function finishRun(
    row: Pick<GolondrinaAutomation, 'action' | 'runsLeft' | 'runsDone' | 'lastSentAt'>,
    now: Date,
    ok: boolean,
): Pick<GolondrinaAutomation, 'status' | 'nextRunAt' | 'runsLeft' | 'runsDone' | 'lastSentAt'> {
    if (!ok) {
        return {
            status: 'active',
            nextRunAt: new Date(now.getTime() + 15 * 60_000),
            runsLeft: row.runsLeft,
            runsDone: row.runsDone,
            lastSentAt: row.lastSentAt,
        };
    }
    const runsLeft = Math.max(0, row.runsLeft - 1);
    const nextRunAt = nextAfterRun(row.action, now, runsLeft);
    return {
        status: nextRunAt ? 'active' : 'done',
        nextRunAt,
        runsLeft,
        runsDone: row.runsDone + 1,
        lastSentAt: now,
    };
}

function toView(row: GolondrinaAutomation): AutomationView {
    return {
        id: row.id,
        lessonId: row.lessonId,
        action: row.action,
        channel: row.channel,
        status: row.status,
        nextRunAt: row.nextRunAt,
        runsLeft: row.runsLeft,
        runsDone: row.runsDone,
        lastSentAt: row.lastSentAt,
    };
}
