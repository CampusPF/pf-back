import { MailContext, MailParams, RenderedMail, button, esc, h1, layout, p, setPasswordNotice } from './layout';

/** Bienvenida admin. params: name, adminUrl, setPasswordUrl? */
export function welcomeAdminEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: 'Tu cuenta de administrador en Campus',
        html: layout(
            ctx,
            'Ya tenés acceso al panel de administración.',
            h1(`Hola, ${esc(params.name)}`) +
                p(
                    'Tu cuenta de administrador de Campus ya está activa. Desde el panel podés ' +
                        'gestionar usuarios, cursos y pagos.',
                ) +
                setPasswordNotice(params.setPasswordUrl) +
                button('Ir al panel de administración', params.adminUrl),
        ),
    };
}
