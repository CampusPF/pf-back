import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, h1, layout, p, txt } from './layout';

/**
 * Aviso de Golondrina (lo que el alumno activó desde el asistente de una
 * lección). params: name, title, message, items[] (puntos del resumen,
 * opcional), ctaLabel, ctaUrl.
 */
export function golondrinaEmail(params: MailParams, ctx: MailContext): RenderedMail {
    const items = (Array.isArray(params.items) ? params.items : []) as unknown[];
    const list = items
        .map((item) => `<div style="padding:4px 0;color:${C.text2};">• ${esc(item)}</div>`)
        .join('');

    return {
        subject: txt(params.title),
        html: layout(
            ctx,
            esc(params.message),
            h1(esc(params.title)) +
                p(`Hola ${esc(params.name)}, ${esc(params.message)}`) +
                (list ? box(list, { bg: C.bg, border: C.border }) : '') +
                button(String(params.ctaLabel ?? 'Abrir'), params.ctaUrl) +
                p('Lo activaste desde el asistente de la lección. Podés apagarlo ahí mismo.', C.muted, 13),
        ),
    };
}
