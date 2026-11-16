import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GolondrinaService } from './golondrina.service';
import { MailTemplate } from '../mail/templates';

function makeService(opts: {
    lesson?: unknown;
    canAccess?: boolean;
    canReach?: boolean;
    existing?: unknown;
    dueRows?: unknown[];
    emailOk?: boolean;
} = {}) {
    const saved: any[] = [];
    const automations = {
        findOne: jest.fn(async () => opts.existing ?? null),
        find: jest.fn(async () => []),
        create: jest.fn((v: any) => ({ id: 'a-1', ...v })),
        save: jest.fn(async (row: any) => {
            saved.push({ ...row });
            return { id: row.id ?? 'a-1', ...row };
        }),
    };
    const qb: any = {
        addSelect: () => qb,
        leftJoinAndSelect: () => qb,
        where: () => qb,
        getOne: jest.fn(async () => opts.lesson ?? null),
    };
    const lessons = { createQueryBuilder: () => qb };
    const user = { id: 'u-1', name: 'Ana', email: 'ana@test.com' };
    const users = { findOne: jest.fn(async () => user), find: jest.fn(async () => [user]) };
    const dataSource = { query: jest.fn(async () => opts.dueRows ?? []) };
    const access = { canAccessCourseContent: jest.fn(async () => opts.canAccess ?? true) };
    const push = { canReach: jest.fn(async () => opts.canReach ?? false), sendToUser: jest.fn(async () => undefined) };
    const inApp = { create: jest.fn(async () => ({})) };
    const emails = { deliver: jest.fn(async () => opts.emailOk ?? true), url: (p: string) => `https://campus.test${p}` };
    const config = { get: () => undefined };

    const service = new GolondrinaService(
        config as any,
        {} as any,
        dataSource as any,
        automations as any,
        lessons as any,
        users as any,
        access as any,
        push as any,
        inApp as any,
        emails as any,
    );
    return { service, automations, dataSource, access, push, inApp, emails, saved };
}

const LESSON = {
    id: 'l-1',
    title: 'Variables',
    content: '## let\nx\n\n## const\ny\n\n## var\nz',
    isFree: false,
    module: { course: { id: 'c-1', slug: 'js', priceInCents: 0, instructor: { id: 't-1' } } },
};
const NOW = new Date('2026-11-10T18:00:00Z');

describe('GolondrinaService.create', () => {
    it('sin acceso a la lección no activa nada', async () => {
        const { service, automations } = makeService({ lesson: LESSON, canAccess: false });
        await expect(service.create({ id: 'u-1' }, 'l-1', 'recordar', 'push', NOW)).rejects.toBeInstanceOf(ForbiddenException);
        expect(automations.save).not.toHaveBeenCalled();
    });

    it('lección inexistente: 404', async () => {
        const { service } = makeService({ lesson: null });
        await expect(service.create({ id: 'u-1' }, 'l-1', 'recordar', 'push', NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recordar queda programada para mañana a las 19:00 (Argentina)', async () => {
        const { service } = makeService({ lesson: LESSON });
        const view = await service.create({ id: 'u-1' }, 'l-1', 'recordar', 'in_app', NOW);
        expect(view).toEqual(expect.objectContaining({
            action: 'recordar', status: 'active', runsLeft: 1, nextRunAt: new Date('2026-11-11T22:00:00Z'),
        }));
    });

    it('tocarla de nuevo reprograma la misma fila en vez de duplicarla', async () => {
        const existing = { id: 'a-9', userId: 'u-1', lessonId: 'l-1', action: 'plan', status: 'cancelled', runsDone: 2 };
        const { service, automations } = makeService({ lesson: LESSON, existing });
        const view = await service.create({ id: 'u-1' }, 'l-1', 'plan', 'email', NOW);
        expect(automations.create).not.toHaveBeenCalled();
        expect(view).toEqual(expect.objectContaining({ id: 'a-9', status: 'active', runsDone: 0, runsLeft: 3, channel: 'email' }));
    });

    it('resumen sale en el momento por mail, con los puntos de la lección', async () => {
        const { service, emails } = makeService({ lesson: LESSON });
        const view = await service.create({ id: 'u-1' }, 'l-1', 'resumen', 'email', NOW);
        expect(view.status).toBe('done');
        expect(view.deliveredVia).toBe('email');
        const req = (emails.deliver.mock.calls[0] as unknown[])[0] as any;
        expect(req.template).toBe(MailTemplate.GOLONDRINA);
        expect(req.params.items).toEqual(['let', 'const', 'var']);
        expect(req.params.ctaUrl).toBe('https://campus.test/courses/js/learn/l-1');
        expect(req.dedupeKey).toBe('golondrina:a-1:0');
    });

    it('push sin navegador suscripto cae en la campanita', async () => {
        const { service, push, inApp } = makeService({ lesson: LESSON, canReach: false });
        const view = await service.create({ id: 'u-1' }, 'l-1', 'resumen', 'push', NOW);
        expect(push.sendToUser).not.toHaveBeenCalled();
        expect(inApp.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', type: 'golondrina' }));
        expect(view.deliveredVia).toBe('in_app');
    });
});

describe('GolondrinaService.runDue', () => {
    it('manda lo pendiente y reprograma el plan 48 h después', async () => {
        const row = { id: 'a-1', userId: 'u-1', action: 'plan', channel: 'push', runsLeft: 3, runsDone: 0, lastSentAt: null };
        const { service, push, automations, saved } = makeService({
            canReach: true,
            dueRows: [{ id: 'a-1', user_id: 'u-1', lesson_id: 'l-1', action: 'plan', channel: 'push', runs_left: 3, runs_done: 0, lesson_title: 'Variables', course_slug: 'js' }],
        });
        automations.findOne.mockResolvedValue(row as any);
        const now = new Date('2026-11-11T21:45:00Z');

        const result = await service.runDue(now);

        expect(result).toEqual({ due: 1, sent: 1, failed: 0 });
        expect(push.sendToUser).toHaveBeenCalledWith('u-1', expect.objectContaining({
            body: 'Releer la lección de «Variables» (20 min).', url: '/courses/js/learn/l-1',
        }));
        expect(saved.at(-1)).toEqual(expect.objectContaining({
            status: 'active', runsLeft: 2, runsDone: 1, nextRunAt: new Date('2026-11-13T21:45:00Z'),
        }));
    });

    it('sin nada pendiente no toca la base de más', async () => {
        const { service, automations } = makeService({ dueRows: [] });
        expect(await service.runDue()).toEqual({ due: 0, sent: 0, failed: 0 });
        expect(automations.findOne).not.toHaveBeenCalled();
    });
});

describe('GolondrinaService.onTeacherReplied', () => {
    it('avisa sólo si el que escribe es el docente de un curso con la acción activa', async () => {
        const { service, dataSource, inApp } = makeService();
        dataSource.query.mockResolvedValueOnce([{ id: 'a-1', lesson_title: 'Variables' }]);
        (service as any).automations.findOne.mockResolvedValue({ id: 'a-1', channel: 'in_app', action: 'docente', runsDone: 0 });

        const ok = await service.onTeacherReplied('u-1', 't-1', { kind: 'forum', id: 'p-1', threadId: 'th-1' });

        expect(ok).toBe(true);
        expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('"instructorId" = $2'), ['u-1', 't-1']);
        expect(inApp.create).toHaveBeenCalledWith(expect.objectContaining({ link: '/dashboard/foros/hilo/th-1' }));
    });

    it('nadie se avisa a sí mismo', async () => {
        const { service, dataSource } = makeService();
        expect(await service.onTeacherReplied('t-1', 't-1', { kind: 'chat', id: 'm-1' })).toBe(false);
        expect(dataSource.query).not.toHaveBeenCalled();
    });
});
