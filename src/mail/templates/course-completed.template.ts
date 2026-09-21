import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, txt, h1, layout, link, p, small } from './layout';

/** Curso completado. params: name, courseTitle, coursesUrl, myCoursesUrl. */
export function courseCompletedEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `¡Completaste "${txt(params.courseTitle)}"!`,
        html: layout(
            ctx,
            'Felicitaciones por terminar el curso.',
            h1(`¡Felicitaciones, ${esc(params.name)}! 🎉`) +
                p(
                    `Terminaste <strong>${esc(params.courseTitle)}</strong>. Es un gran logro: ` +
                        'le dedicaste tiempo y esfuerzo, y se nota.',
                ) +
                box('Tu certificado te llega en un mail aparte, en unos minutos.', { bg: C.successSubtle }) +
                button('Buscar mi próximo curso', params.coursesUrl) +
                small(`Repasá lo que ya hiciste en ${link('Mis cursos', params.myCoursesUrl)}.`),
        ),
    };
}
