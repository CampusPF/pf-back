/**
 * HTML del mail de "inscripción a curso".
 *
 * Mismo criterio que reset-password: literal, estilos inline, sin deps
 * externas. Gmail y Outlook ignoran/recortan CSS externo.
 *
 * Todos los valores se escapan porque vienen de la DB (el nombre del curso
 * puede tener comillas, el del user puede tener HTML, etc.).
 */
export function enrollmentEmail(params: {
    studentName: string;
    courseName: string;
    courseUrl: string;
    instructorName?: string;
    isReactivation?: boolean;
}): string {
    const { studentName, courseName, courseUrl, instructorName, isReactivation } = params;

    const title = isReactivation
        ? `¡Volviste a ${escapeHtml(courseName)}! 🎉`
        : `¡Te inscribiste a ${escapeHtml(courseName)}! 🎉`;

    const intro = isReactivation
        ? `Reactivamos tu inscripción al curso <strong>${escapeHtml(courseName)}</strong>.`
        : `Confirmamos tu inscripción al curso <strong>${escapeHtml(courseName)}</strong>.`;

    return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827;">${title}</h2>
      <p>Hola ${escapeHtml(studentName)},</p>
      <p>${intro}</p>
      ${instructorName
            ? `<p style="font-size: 14px; color: #6b7280;">
               <strong>Instructor:</strong> ${escapeHtml(instructorName)}
             </p>`
            : ''
        }
      <p style="margin: 28px 0;">
        <a href="${escapeHtml(courseUrl)}"
           style="background:#4f46e5; color:#ffffff; padding:12px 24px;
                  border-radius:6px; text-decoration:none; display:inline-block;
                  font-weight:bold;">
          Ir al curso
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Si el botón no funciona, copiá y pegá este link en tu navegador:<br />
        <span style="word-break: break-all;">${escapeHtml(courseUrl)}</span>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        ¡Nos vemos en clase!
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}