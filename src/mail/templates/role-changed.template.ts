import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, txt, h1, layout, p, rows, small } from './layout';

/**
 * Cambio de rol de un usuario (student / teacher / admin).
 * params: name, previousRole, newRole, dashboardUrl.
 */
export function roleChangedEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `Tu rol en Campus cambió`,
        html: layout(
            ctx,
            'Un administrador actualizó tus permisos.',
            h1('Tu rol en Campus cambió') +
                p(
                    `Hola ${esc(params.name)}, un administrador cambió tu rol en la plataforma.`,
                ) +
                box(
                    rows([
                        ['Antes', esc(params.previousRole)],
                        ['Ahora', `<strong style="color:${C.primary};">${esc(params.newRole)}</strong>`],
                    ]),
                    { bg: C.bg, border: C.border },
                ) +
                button('Ir a mi panel', params.dashboardUrl) +
                small('Si no esperabas este cambio, escribile al equipo de Campus.'),
        ),
    };
}
