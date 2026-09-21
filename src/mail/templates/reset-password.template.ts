import { MailContext, MailParams, RenderedMail, button, esc, h1, layout, p, small } from './layout';

/**
 * Recuperar contraseña. params: name, resetUrl, expiresInMinutes.
 * Es la misma para estudiante, docente y admin.
 */
export function resetPasswordEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: 'Restablecé tu contraseña',
        html: layout(
            ctx,
            'Usá este enlace para elegir una contraseña nueva.',
            h1('Restablecé tu contraseña') +
                p(`Hola ${esc(params.name)}, recibimos un pedido para cambiar la contraseña de tu cuenta.`) +
                button('Elegir nueva contraseña', params.resetUrl) +
                small(
                    `El enlace vence en ${esc(params.expiresInMinutes)} minutos. Si no pediste el cambio, ` +
                        'ignorá este mail: tu contraseña sigue siendo la misma.',
                ),
        ),
    };
}

