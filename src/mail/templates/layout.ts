/**
 * Piezas compartidas por todos los mails: layout, tokens de diseño y bloques
 * (título, párrafo, botón, caja, tabla de datos).
 *
 * El HTML se genera acá, en el back, y se manda como `htmlContent` por la API
 * de Brevo: no depende de plantillas alojadas en ninguna cuenta de Brevo, así
 * que funciona con cualquier API key y remitente verificado.
 *
 * Estilos inline y layout con tablas a propósito: los clientes de correo
 * (Gmail, Outlook) ignoran o recortan las hojas de estilo y no soportan flex
 * ni grid. Los tokens salen de pf-front/app/globals.css (tema claro).
 */

/** Datos que cada plantilla recibe (los arma quien manda el mail). */
export type MailParams = Record<string, unknown>;

/** Contexto de render que no viene del dominio sino de la configuración. */
export interface MailContext {
    /** URL absoluta y pública del logo (pf-front/public/logo-campus.png). */
    logoUrl: string;
}

export interface RenderedMail {
    subject: string;
    html: string;
}

export const COLORS = {
    bg: '#F6F6F7',
    surface: '#FFFFFF',
    border: '#E4E4EA',
    text: '#0F0F14',
    text2: '#4A4A57',
    muted: '#6C6C82',
    primary: '#4F46E5', // --color-primary-solid: soporta texto blanco encima
    primarySubtle: '#EEF2FF',
    accent: '#C2410C',
    accentSubtle: '#FFF7ED',
    success: '#047857',
    successSubtle: '#ECFDF5',
} as const;

const C = COLORS;
const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Escapa texto para meterlo en HTML (contenido o atributos). Todo dato que
 * llega por `params` — nombres que carga el usuario, títulos de curso, URLs —
 * es texto no confiable: sin escaparlo, un nombre como `<img src=x onerror=…>`
 * se interpretaría como markup en el cliente de correo de quien lo reciba.
 */
export function esc(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Texto plano para el asunto: NO se escapa (no es HTML, "&quot;" se vería
 * literal), pero se aplana a una línea.
 */
export function txt(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// ── Bloques ──────────────────────────────────────────────────────────
// Reciben HTML ya armado: quien los llama escapa con `esc()` lo que sea dato.

export function h1(html: string): string {
    return `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${C.text};">${html}</h1>`;
}

export function p(html: string, color: string = C.text2, size = 16): string {
    return `<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color};">${html}</p>`;
}

export function small(html: string): string {
    return p(html, C.muted, 13);
}

export function button(label: string, url: unknown, color: string = C.primary): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" bgcolor="${color}" style="border-radius:8px;">
      <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

export function box(
    innerHtml: string,
    opts: { bg?: string; border?: string } = {},
): string {
    const bg = opts.bg ?? C.primarySubtle;
    const border = opts.border ? `border:1px solid ${opts.border};` : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td style="background:${bg};${border}border-radius:12px;padding:20px 24px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text};">
${innerHtml}
    </td>
  </tr>
</table>`;
}

/** Tabla etiqueta/valor (comprobantes). El valor llega como HTML. */
export function rows(pairs: Array<[label: string, valueHtml: string]>): string {
    const trs = pairs
        .map(
            ([k, v]) =>
                `<tr><td style="padding:6px 0;font-family:${FONT};font-size:14px;color:${C.muted};">${esc(k)}</td>` +
                `<td align="right" style="padding:6px 0;font-family:${FONT};font-size:14px;font-weight:600;color:${C.text};">${v}</td></tr>`,
        )
        .join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${trs}</table>`;
}

export function link(label: string, url: unknown, color: string = C.primary): string {
    return `<a href="${esc(url)}" target="_blank" style="color:${color};text-decoration:underline;">${esc(label)}</a>`;
}

/** Aviso "elegí tu contraseña", sólo si la cuenta la creó un admin. */
export function setPasswordNotice(setPasswordUrl: unknown): string {
    if (!setPasswordUrl) return '';
    return box(
        `<strong>Primero, elegí tu contraseña.</strong><br>` +
            `Tu cuenta la creó un administrador. Para entrar, definí tu contraseña desde este ${link('enlace', setPasswordUrl)}.`,
    );
}

/** Pie de los recordatorios: link para darse de baja. */
export function unsubscribeFooter(unsubscribeUrl: unknown): string {
    if (!unsubscribeUrl) return '';
    return `<br>${link('Dejar de recibir estos recordatorios', unsubscribeUrl, C.muted)}`;
}

// ── Layout ───────────────────────────────────────────────────────────

export function layout(
    ctx: MailContext,
    preheader: string,
    body: string,
    footerExtra = '',
): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>Campus</title>
<style>
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .card { padding:28px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <!-- Logo -->
        <tr>
          <td align="center" style="padding:0 0 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:10px;"><img src="${esc(ctx.logoUrl)}" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px;"></td>
                <td style="font-family:${FONT};font-size:22px;font-weight:700;color:${C.text};">Campus</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Contenido -->
        <tr>
          <td class="card" bgcolor="${C.surface}" style="background:${C.surface};border:1px solid ${C.border};border-radius:16px;padding:40px;">
${body}
            <p style="margin:8px 0 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text2};">¡Nos vemos en el Campus!<br><strong style="color:${C.text};">El equipo de Campus</strong></p>
          </td>
        </tr>
        <!-- Pie -->
        <tr>
          <td align="center" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};">
            Campus — Aprendé con un tutor de IA a tu lado.<br>
            Recibiste este mail porque tenés una cuenta en Campus.${footerExtra}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}
