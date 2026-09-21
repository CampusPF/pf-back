import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, txt, h1, layout, link, p, small } from './layout';

interface Lesson { title?: unknown; duration?: unknown }
interface Module { title?: unknown; lessons?: Lesson[] }

/**
 * Inscripción a un curso. params: name, courseTitle, courseImageUrl?,
 * courseUrl, firstLessonUrl, totalLessons, totalMinutes,
 * modules[] { title, lessons[] { title, duration } }.
 */
export function courseEnrolledEmail(params: MailParams, ctx: MailContext): RenderedMail {
    const modules = (Array.isArray(params.modules) ? params.modules : []) as Module[];

    const image = params.courseImageUrl
        ? `<img src="${esc(params.courseImageUrl)}" width="518" alt="${esc(params.courseTitle)}" ` +
          'style="display:block;width:100%;max-width:518px;height:auto;border:0;border-radius:12px;margin:0 0 24px;">'
        : '';

    const syllabus = modules
        .map(
            (m) =>
                `<div style="font-weight:600;color:${C.text};margin-top:12px;">${esc(m.title)}</div>` +
                (m.lessons ?? [])
                    .map(
                        (l) =>
                            `<div style="font-size:14px;color:${C.text2};padding-left:12px;">• ${esc(l.title)}` +
                            (Number(l.duration) > 0
                                ? ` <span style="color:${C.muted};">· ${esc(l.duration)} min</span>`
                                : '') +
                            '</div>',
                    )
                    .join(''),
        )
        .join('');

    return {
        subject: `Te inscribiste a "${txt(params.courseTitle)}"`,
        html: layout(
            ctx,
            'Ya podés empezar la primera lección.',
            image +
                h1(`¡Ya estás en "${esc(params.courseTitle)}"!`) +
                p(
                    `Hola ${esc(params.name)}, tu inscripción está confirmada. El curso tiene ` +
                        `<strong>${esc(params.totalLessons)} lecciones</strong> y dura unos ` +
                        `<strong>${esc(params.totalMinutes)} minutos</strong>.`,
                ) +
                button('Empezar la primera lección', params.firstLessonUrl) +
                box(
                    `<div style="font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.primary};margin-bottom:8px;">Temario</div>\n${syllabus}`,
                    { bg: C.bg, border: C.border },
                ) +
                small(`Podés ver el curso completo en ${link('su página', params.courseUrl)}.`),
        ),
    };
}
