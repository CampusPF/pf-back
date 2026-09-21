import { MailContext, MailParams, RenderedMail, button, esc, txt, h1, layout, link, p, setPasswordNotice, small } from './layout';

/** Bienvenida estudiante. params: name, coursesUrl, dashboardUrl, setPasswordUrl? */
export function welcomeStudentEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `¡Bienvenido/a a Campus, ${txt(params.name)}!`,
        html: layout(
            ctx,
            'Tu cuenta ya está lista. Empezá a aprender hoy.',
            h1(`¡Bienvenido/a, ${esc(params.name)}!`) +
                p(
                    'Tu cuenta de estudiante ya está lista. En Campus aprendés a tu ritmo, ' +
                        'con un tutor de IA que te acompaña en cada lección.',
                ) +
                setPasswordNotice(params.setPasswordUrl) +
                button('Explorar cursos', params.coursesUrl) +
                small(`También podés ir directo a tu ${link('panel', params.dashboardUrl)}.`),
        ),
    };
}
