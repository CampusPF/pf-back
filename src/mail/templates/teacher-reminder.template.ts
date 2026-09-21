import { MailContext, MailParams, RenderedMail, button, esc, h1, layout, p, unsubscribeFooter } from './layout';

/**
 * Recordatorio a docentes sin actividad. params: name, daysSinceLastCourse,
 * hasCourses, createCourseUrl, unsubscribeUrl.
 */
export function teacherReminderEmail(params: MailParams, ctx: MailContext): RenderedMail {
    const days = esc(params.daysSinceLastCourse);
    const message = params.hasCourses
        ? p(`Pasaron <strong>${days} días</strong> desde tu último curso. Tus alumnos ya están listos para lo que venga.`)
        : p(
              `Hace <strong>${days} días</strong> que te sumaste a Campus y todavía ` +
                  'no publicaste tu primer curso. ¡Es más fácil de lo que parece!',
          );

    return {
        subject: '¿Qué vas a enseñar ahora?',
        html: layout(
            ctx,
            'Tus alumnos esperan tu próximo curso.',
            h1(`¿Qué vas a enseñar ahora, ${esc(params.name)}?`) +
                message +
                button('Crear un curso', params.createCourseUrl),
            unsubscribeFooter(params.unsubscribeUrl),
        ),
    };
}
