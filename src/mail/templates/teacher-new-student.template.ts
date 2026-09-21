import { COLORS as C, MailContext, MailParams, RenderedMail, box, button, esc, txt, h1, layout, p } from './layout';

/** Aviso al docente. params: teacherName, studentName, courseTitle, totalStudents, courseAdminUrl. */
export function teacherNewStudentEmail(params: MailParams, ctx: MailContext): RenderedMail {
    return {
        subject: `Nuevo alumno en "${txt(params.courseTitle)}"`,
        html: layout(
            ctx,
            `${esc(params.studentName)} se inscribió a tu curso.`,
            h1('¡Tenés un alumno nuevo!') +
                p(
                    `Hola ${esc(params.teacherName)}, <strong>${esc(params.studentName)}</strong> se ` +
                        `inscribió a <strong>${esc(params.courseTitle)}</strong>.`,
                ) +
                box(
                    `<div style="font-size:13px;color:${C.muted};">Alumnos inscriptos</div>` +
                        `<div style="font-size:28px;font-weight:700;color:${C.primary};">${esc(params.totalStudents)}</div>`,
                ) +
                button('Ver mi curso', params.courseAdminUrl),
        ),
    };
}
