/**
 * Genera y/o manda los mails REALES (los mismos que salen del back) con datos
 * de ejemplo, sin levantar la app.
 *
 *   npx ts-node --transpile-only email-templates/preview.ts                 # escribe html/*.html
 *   npx ts-node --transpile-only email-templates/preview.ts --send yo@mail.com   # además los manda por Brevo
 *   npx ts-node --transpile-only email-templates/preview.ts --send yo@mail.com certificate reset-password
 *
 * `--send` lee BREVO_API_KEY y MAIL_FROM_ADDRESS de pf-back/.env y gasta 1 de
 * los 300 mails/día del plan gratuito por plantilla.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MailTemplate, renderMail } from '../src/mail/templates';
import { SAMPLES } from '../src/mail/templates/templates.fixtures';

const env = Object.fromEntries(
    (() => { try { return readFileSync(join(__dirname, '../.env'), 'utf8'); } catch { return ''; } })()
        .split('\n')
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
);

const args = process.argv.slice(2);
const sendIdx = args.indexOf('--send');
const to = sendIdx >= 0 ? args[sendIdx + 1] : undefined;
const only = args.filter((a) => (Object.values(MailTemplate) as string[]).includes(a)) as MailTemplate[];
const templates = only.length ? only : Object.values(MailTemplate);

const front = (env.FRONTEND_URL ?? 'http://localhost:3000').split(',')[0].trim();
const logoUrl = env.MAIL_LOGO_URL || `${front}/logo-campus.png`;

const outDir = join(__dirname, 'html');
mkdirSync(outDir, { recursive: true });

async function main() {
    for (const t of templates) {
        const { subject, html } = renderMail(t, SAMPLES[t], { logoUrl });
        writeFileSync(join(outDir, `${t}.html`), html, 'utf8');
        console.log(`HTML  ${t.padEnd(22)} ${subject}`);

        if (!to) continue;
        if (!env.BREVO_API_KEY || !env.MAIL_FROM_ADDRESS) throw new Error('Faltan BREVO_API_KEY / MAIL_FROM_ADDRESS en pf-back/.env');
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: { email: env.MAIL_FROM_ADDRESS, name: env.MAIL_FROM_NAME || 'Campus' },
                to: [{ email: to }],
                subject: `[PRUEBA] ${subject}`,
                htmlContent: html,
                tags: ['prueba-plantillas'],
            }),
        });
        console.log(`${res.ok ? 'SENT ' : 'FAIL '} ${t} → ${to} (${res.status})`);
        if (!res.ok) process.exitCode = 1;
    }
}
void main();
