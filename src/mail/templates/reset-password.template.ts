/**
 * HTML del mail de "recuperar contraseña".
 *
 * Template literal y no un motor de plantillas (Handlebars y compañía) porque
 * es el único mail que existe hoy y no justifica sumar una dependencia. Si
 * llegan a ser varios, conviene mover esto a un motor con layout compartido.
 *
 * Estilos inline a propósito: los clientes de correo (Gmail, Outlook) ignoran
 * o recortan las hojas de estilo y las clases CSS.
 */
export function resetPasswordEmail(name: string, resetUrl: string): string {
    return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827;">Recuperá tu contraseña</h2>
      <p>Hola ${escapeHtml(name)},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña en Campus.</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}"
           style="background:#4f46e5; color:#ffffff; padding:12px 24px;
                  border-radius:6px; text-decoration:none; display:inline-block;
                  font-weight:bold;">
          Elegir nueva contraseña
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Si el botón no funciona, copiá y pegá este link en tu navegador:<br />
        <span style="word-break: break-all;">${resetUrl}</span>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        Este link expira en 1 hora y se puede usar una sola vez. Si no pediste
        esto, ignorá el mail — tu cuenta sigue segura.
      </p>
    </div>
  `;
}

/**
 * El nombre lo carga el usuario al registrarse, así que es texto no confiable
 * metido dentro de HTML: sin escaparlo, un nombre como
 * `<img src=x onerror=...>` se interpretaría como markup en el cliente de
 * correo de quien lo reciba.
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
