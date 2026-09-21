import { RemindersService, isoWeekKey } from './reminders.service';
import { MailTemplate } from '../mail/mail-templates';

describe('isoWeekKey', () => {
    it.each([
        ['2026-09-21', '2026-W39'], // lunes
        ['2026-09-27', '2026-W39'], // domingo, misma semana
        ['2027-01-01', '2026-W53'], // viernes: todavía es la última semana de 2026
        ['2024-12-30', '2025-W01'], // lunes que ya es la semana 1 de 2025
    ])('%s → %s', (date, expected) => {
        expect(isoWeekKey(new Date(`${date}T12:00:00`))).toBe(expected);
    });
});

describe('RemindersService', () => {
    function makeService(rows: unknown[]) {
        const dataSource = { query: jest.fn(async () => rows) };
        const emails = {
            deliver: jest.fn(async () => true),
            url: (path: string) => `https://campus.test${path}`,
        };
        const unsubscribeTokens = { generate: () => 'unsub' };
        const config = { get: (key: string) => (key === 'API_PUBLIC_URL' ? 'https://api.test' : undefined) };

        const service = new RemindersService(
            config as any,
            {} as any,
            dataSource as any,
            emails as any,
            unsubscribeTokens as any,
        );
        return { service, dataSource, emails };
    }

    it('alumnos: un mail por alumno con todos sus cursos inactivos', async () => {
        const { service, emails, dataSource } = makeService([
            { user_id: 'u-1', name: 'Ana', email: 'ana@test.com', course_title: 'A', course_slug: 'a', days_inactive: 20 },
            { user_id: 'u-1', name: 'Ana', email: 'ana@test.com', course_title: 'B', course_slug: 'b', days_inactive: 9 },
            { user_id: 'u-2', name: 'Beto', email: 'beto@test.com', course_title: 'A', course_slug: 'a', days_inactive: 8 },
        ]);

        const sent = await service.runStudentReminders();

        expect(sent).toBe(2);
        // El umbral de días viaja como parámetro (default 7), no interpolado.
        expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [7]);
        expect(emails.deliver).toHaveBeenCalledTimes(2);

        const ana = (emails.deliver.mock.calls[0] as unknown[])[0] as any;
        expect(ana.user).toEqual({ id: 'u-1', name: 'Ana', email: 'ana@test.com' });
        expect(ana.template).toBe(MailTemplate.STUDENT_REMINDER);
        expect(ana.dedupeKey).toMatch(/^student-reminder:\d{4}-W\d{2}$/);
        expect(ana.params.courses).toEqual([
            { title: 'A', daysInactive: 20, url: 'https://campus.test/courses/a' },
            { title: 'B', daysInactive: 9, url: 'https://campus.test/courses/b' },
        ]);
        expect(ana.params.unsubscribeUrl).toBe('https://api.test/notifications/unsubscribe?token=unsub');
    });

    it('docentes: un mail por docente inactivo, con los días desde su último curso', async () => {
        const { service, emails } = makeService([
            { user_id: 't-1', name: 'Tomás', email: 't@test.com', course_count: 2, days_since_last_course: 45 },
        ]);

        const sent = await service.runTeacherReminders();

        expect(sent).toBe(1);
        const call = (emails.deliver.mock.calls[0] as unknown[])[0] as any;
        expect(call.template).toBe(MailTemplate.TEACHER_REMINDER);
        expect(call.dedupeKey).toMatch(/^teacher-reminder:\d{4}-W\d{2}$/);
        expect(call.params).toEqual(
            expect.objectContaining({
                daysSinceLastCourse: 45,
                hasCourses: true,
                createCourseUrl: 'https://campus.test/dashboard/admin/cursos/nuevo',
            }),
        );
    });

    it('un envío que ya se hizo esta semana no cuenta como enviado', async () => {
        const { service, emails } = makeService([
            { user_id: 'u-1', name: 'Ana', email: 'ana@test.com', course_title: 'A', course_slug: 'a', days_inactive: 20 },
        ]);
        emails.deliver.mockResolvedValueOnce(false);

        expect(await service.runStudentReminders()).toBe(0);
    });
});
