import { MailContext, MailParams, RenderedMail, box, button, esc, h1, layout, p, txt } from './layout';

/**
 * Curso desactivado por un administrador. params: name, courseTitle,
 * coursesUrl.
 */
export function courseBlockedByAdminEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `Tu curso "${txt(params.courseTitle)}" fue desactivado`,
        html: layout(
            ctx,
            'Un administrador desactivó tu curso.',
            h1('Tu curso fue desactivado') +
                p(`Hola ${esc(params.name)}, un administrador desactivó tu curso.`) +
                box(
                    `<strong>${esc(params.courseTitle)}</strong><br>` +
                        'No podés editarlo ni reactivarlo hasta que un admin lo restaure.',
                ) +
                p('Si creés que es un error, contactá al equipo de Campus.') +
                button('Ver mis cursos', params.coursesUrl),
        ),
    };
}
