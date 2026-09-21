import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, txt, h1, layout, link, p, rows, small } from './layout';

/** Suscripción Premium activa. params: name, planName, amount, validUntil?, coursesUrl, paymentsUrl. */
export function premiumConfirmedEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `¡Ya sos ${txt(params.planName)}!`,
        html: layout(
            ctx,
            'Tu suscripción está activa: todos los cursos, sin límites.',
            h1(`¡Ya sos ${esc(params.planName)}! ⭐`) +
                p(
                    `Hola ${esc(params.name)}, tu suscripción está activa. Ya podés acceder a todos ` +
                        'los cursos del Campus.',
                ) +
                box(
                    rows([
                        ['Plan', esc(params.planName)],
                        ['Total', esc(params.amount)],
                        ['Válido hasta', params.validUntil ? esc(params.validUntil) : '—'],
                    ]),
                    { bg: C.accentSubtle },
                ) +
                button('Explorar cursos', params.coursesUrl) +
                small(`Podés ver tus pagos en ${link('Configuración', params.paymentsUrl)}.`),
        ),
    };
}
