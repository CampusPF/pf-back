import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, txt, h1, layout, link, p, rows, small } from './layout';

/**
 * Compra de curso confirmada. params: name, courseTitle, amount, paidAt,
 * paymentId, firstLessonUrl, paymentsUrl.
 */
export function coursePurchasedEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `Compra confirmada: ${txt(params.courseTitle)}`,
        html: layout(
            ctx,
            'Tu pago se acreditó. Ya tenés acceso al curso.',
            h1('¡Compra confirmada!') +
                p(
                    `Hola ${esc(params.name)}, tu pago se acreditó y ya tenés acceso a ` +
                        `<strong>${esc(params.courseTitle)}</strong>.`,
                ) +
                box(
                    rows([
                        ['Curso', esc(params.courseTitle)],
                        ['Total', esc(params.amount)],
                        ['Fecha', esc(params.paidAt)],
                        ['N.º de operación', `<span style="font-family:monospace;font-size:12px;">${esc(params.paymentId)}</span>`],
                    ]),
                    { bg: C.bg, border: C.border },
                ) +
                button('Ir al curso', params.firstLessonUrl) +
                small(`Podés ver tus pagos en ${link('Configuración', params.paymentsUrl)}.`),
        ),
    };
}
