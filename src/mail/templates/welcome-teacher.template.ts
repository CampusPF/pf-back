import { MailContext, MailParams, RenderedMail, button, esc, txt, h1, layout, link, p, setPasswordNotice, small } from './layout';

/** Bienvenida docente. params: name, createCourseUrl, dashboardUrl, setPasswordUrl? */
export function welcomeTeacherEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `¡Bienvenido/a a Campus, ${txt(params.name)}!`,
        html: layout(
            ctx,
            'Tu cuenta de docente ya está lista. Creá tu primer curso.',
            h1(`¡Bienvenido/a, ${esc(params.name)}!`) +
                p(
                    'Tu cuenta de docente ya está lista. Armá tu curso con módulos y lecciones, ' +
                        'y tus alumnos van a tener un tutor de IA que los acompaña.',
                ) +
                setPasswordNotice(params.setPasswordUrl) +
                button('Crear mi primer curso', params.createCourseUrl) +
                small(`También podés ir directo a tu ${link('panel', params.dashboardUrl)}.`),
        ),
    };
}
