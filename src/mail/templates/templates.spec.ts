import { MailTemplate, renderMail } from './index';
import { SAMPLES } from './templates.fixtures';

const CTX = { logoUrl: 'https://campus.test/logo-campus.png' };

describe('plantillas de mail', () => {
    it.each(Object.values(MailTemplate))('%s genera asunto y HTML sin restos de sintaxis', (template) => {
        const { subject, html } = renderMail(template, SAMPLES[template], CTX);

        expect(subject.length).toBeGreaterThan(0);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('https://campus.test/logo-campus.png');
        expect(html).not.toMatch(/\{\{|\{%|undefined|\[object Object\]/);
    });

    it('escapa los datos del usuario en el HTML pero no en el asunto', () => {
        const name = '<img src=x onerror=alert(1)> & "Co"';
        const { subject, html } = renderMail(MailTemplate.WELCOME_ADMIN, { name, adminUrl: 'https://campus.test/a' }, CTX);

        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Co&quot;');
        expect(subject).toBe('Tu cuenta de administrador en Campus');

        const student = renderMail(MailTemplate.WELCOME_STUDENT, { ...SAMPLES[MailTemplate.WELCOME_STUDENT], name: 'Ana "la" Pérez' }, CTX);
        expect(student.subject).toBe('¡Bienvenido/a a Campus, Ana "la" Pérez!');
    });

    it('el aviso de contraseña sólo aparece con setPasswordUrl', () => {
        const withUrl = renderMail(MailTemplate.WELCOME_STUDENT, SAMPLES[MailTemplate.WELCOME_STUDENT], CTX);
        const without = renderMail(MailTemplate.WELCOME_STUDENT, { ...SAMPLES[MailTemplate.WELCOME_STUDENT], setPasswordUrl: undefined }, CTX);

        expect(withUrl.html).toContain('elegí tu contraseña');
        expect(without.html).not.toContain('elegí tu contraseña');
    });

    it('teacher-reminder cambia el texto según tenga o no cursos', () => {
        const base = SAMPLES[MailTemplate.TEACHER_REMINDER];
        expect(renderMail(MailTemplate.TEACHER_REMINDER, base, CTX).html).toContain('desde tu último curso');
        expect(renderMail(MailTemplate.TEACHER_REMINDER, { ...base, hasCourses: false }, CTX).html).toContain('todavía');
    });
});
