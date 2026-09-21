import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, h1, layout, p, unsubscribeFooter } from './layout';

interface ReminderCourse { title?: unknown; daysInactive?: unknown; url?: unknown }

/**
 * Recordatorio a estudiantes inactivos. params: name, maxDaysInactive,
 * courses[] { title, daysInactive, url }, myCoursesUrl, unsubscribeUrl.
 */
export function studentReminderEmail(params: MailParams, ctx: MailContext): RenderedMail {
    const courses = (Array.isArray(params.courses) ? params.courses : []) as ReminderCourse[];

    const list = courses
        .map(
            (c) =>
                `<div style="padding:6px 0;"><a href="${esc(c.url)}" target="_blank" ` +
                `style="font-weight:600;color:${C.primary};text-decoration:none;">${esc(c.title)}</a>` +
                `<br><span style="font-size:13px;color:${C.muted};">${esc(c.daysInactive)} días sin actividad</span></div>`,
        )
        .join('');

    return {
        subject: 'Te extrañamos en Campus',
        html: layout(
            ctx,
            'Tus cursos te están esperando.',
            h1(`Te extrañamos, ${esc(params.name)}`) +
                p(
                    `Hace <strong>${esc(params.maxDaysInactive)} días</strong> que no entrás a alguno ` +
                        'de tus cursos. Unos minutos hoy alcanzan para retomar el ritmo.',
                ) +
                box(list, { bg: C.bg, border: C.border }) +
                button('Retomar mis cursos', params.myCoursesUrl),
            unsubscribeFooter(params.unsubscribeUrl),
        ),
    };
}
