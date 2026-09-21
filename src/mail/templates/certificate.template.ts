import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, txt, h1, layout, link, p, small } from './layout';

/** Certificado emitido. params: name, courseTitle, code, certificateUrl, verifyUrl. */
export function certificateEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `Tu certificado de "${txt(params.courseTitle)}"`,
        html: layout(
            ctx,
            'Tu certificado ya está disponible para descargar y compartir.',
            h1('Tu certificado está listo') +
                p(
                    `Hola ${esc(params.name)}, ya podés ver y descargar tu certificado de ` +
                        `<strong>${esc(params.courseTitle)}</strong>.`,
                ) +
                box(
                    `<div style="font-size:13px;color:${C.muted};">Código de verificación</div>` +
                        `<div style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:.05em;color:${C.text};">${esc(params.code)}</div>`,
                    { bg: C.bg, border: C.border },
                ) +
                button('Ver mi certificado', params.certificateUrl) +
                small(
                    'Cualquier persona puede comprobar que es auténtico desde ' +
                        `${link('este enlace de verificación', params.verifyUrl)}.`,
                ),
        ),
    };
}
