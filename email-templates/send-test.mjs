/**
 * Prueba las plantillas de Brevo sin levantar la app: verifica que cada
 * BREVO_TPL_* exista y esté activa, y manda cada una con params de ejemplo.
 *
 *   node email-templates/send-test.mjs                  # todas, a MAIL_FROM_ADDRESS
 *   node email-templates/send-test.mjs otra@mail.com    # a otro destinatario
 *   node email-templates/send-test.mjs --check          # sólo verifica, no manda
 *   node email-templates/send-test.mjs yo@mail.com RESET_PASSWORD CERTIFICATE
 *
 * Lee pf-back/.env. Cada envío consume 1 de los 300 mails/día del plan free.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
        .split('\n')
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
);

const API = 'https://api.brevo.com/v3';
const headers = { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' };
const FRONT = (env.FRONTEND_URL ?? 'http://localhost:3000').split(',')[0].trim();
const url = (path) => `${FRONT}${path}`;

// Mismos params que mandan EmailNotificationsService / RemindersService / AuthService.
const SAMPLES = {
    RESET_PASSWORD: { name: 'Ana', resetUrl: url('/reset-password?token=prueba'), expiresInMinutes: 60 },
    WELCOME_STUDENT: {
        name: 'Ana', dashboardUrl: url('/dashboard'), coursesUrl: url('/courses'),
        createCourseUrl: url('/dashboard/admin/cursos/nuevo'), adminUrl: url('/dashboard/admin'),
        setPasswordUrl: url('/reset-password?token=prueba'),
    },
    WELCOME_TEACHER: {
        name: 'Luis', dashboardUrl: url('/dashboard'), coursesUrl: url('/courses'),
        createCourseUrl: url('/dashboard/admin/cursos/nuevo'), adminUrl: url('/dashboard/admin'),
    },
    WELCOME_ADMIN: {
        name: 'Marta', dashboardUrl: url('/dashboard'), coursesUrl: url('/courses'),
        createCourseUrl: url('/dashboard/admin/cursos/nuevo'), adminUrl: url('/dashboard/admin'),
    },
    COURSE_ENROLLED: {
        name: 'Ana', courseTitle: 'Python desde cero', courseImageUrl: null,
        courseUrl: url('/courses/python'), firstLessonUrl: url('/courses/python/learn/1'),
        totalLessons: 3, totalMinutes: 25,
        modules: [
            { title: 'Módulo 1: Introducción', lessons: [{ title: 'Qué es Python', duration: 10 }, { title: 'Instalación', duration: 0 }] },
            { title: 'Módulo 2: Básicos', lessons: [{ title: 'Variables', duration: 15 }] },
        ],
    },
    COURSE_PURCHASED: {
        name: 'Ana', courseTitle: 'Python desde cero', amount: '$ 15.000,00', currency: 'ARS',
        paidAt: '21 de septiembre de 2026', paymentId: 'pay_prueba_123',
        firstLessonUrl: url('/courses/python'), paymentsUrl: url('/dashboard/configuracion'),
    },
    COURSE_COMPLETED: {
        name: 'Ana', courseTitle: 'Python desde cero',
        coursesUrl: url('/courses'), myCoursesUrl: url('/dashboard/mis-cursos'),
    },
    CERTIFICATE: {
        name: 'Ana', courseTitle: 'Python desde cero', code: 'CERT-PRUEBA',
        certificateUrl: url('/dashboard/certificados/CERT-PRUEBA'),
        verifyUrl: url('/certificados/verificar/CERT-PRUEBA'),
    },
    PREMIUM_CONFIRMED: {
        name: 'Ana', planName: 'Premium', amount: '$ 9.999,00', currency: 'ARS',
        validUntil: '21 de octubre de 2026', coursesUrl: url('/courses'),
        paymentsUrl: url('/dashboard/configuracion'),
    },
    STUDENT_REMINDER: {
        name: 'Ana', maxDaysInactive: 9,
        courses: [
            { title: 'Python desde cero', daysInactive: 9, url: url('/courses/python') },
            { title: 'SQL para principiantes', daysInactive: 7, url: url('/courses/sql') },
        ],
        myCoursesUrl: url('/dashboard/mis-cursos'), unsubscribeUrl: 'http://localhost:4000/notifications/unsubscribe?token=prueba',
    },
    TEACHER_NEW_STUDENT: {
        teacherName: 'Luis', studentName: 'Ana', courseTitle: 'Python desde cero',
        totalStudents: 12, courseAdminUrl: url('/dashboard/admin/cursos/1'),
    },
    TEACHER_REMINDER: {
        name: 'Luis', daysSinceLastCourse: 30, hasCourses: true,
        createCourseUrl: url('/dashboard/admin/cursos/nuevo'),
        unsubscribeUrl: 'http://localhost:4000/notifications/unsubscribe?token=prueba',
    },
};

async function brevo(method, path, body) {
    const res = await fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${data.code ?? ''} ${data.message ?? ''}`.trim());
    return data;
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const to = args.find((a) => a.includes('@')) ?? env.MAIL_FROM_ADDRESS;
const only = args.filter((a) => a in SAMPLES);
const names = only.length ? only : Object.keys(SAMPLES);

if (!env.BREVO_API_KEY) throw new Error('Falta BREVO_API_KEY en pf-back/.env');

let failed = 0;
for (const name of names) {
    const id = Number(env[`BREVO_TPL_${name}`]);
    const label = `BREVO_TPL_${name}=${env[`BREVO_TPL_${name}`] || '(vacía)'}`.padEnd(38);
    try {
        if (!id) throw new Error('sin ID en el .env');
        const tpl = await brevo('GET', `/smtp/templates/${id}`);
        if (!tpl.isActive) throw new Error(`"${tpl.name}" está INACTIVA`);
        if (checkOnly) {
            console.log(`OK    ${label} "${tpl.name}" — ${tpl.subject}`);
            continue;
        }
        const { messageId } = await brevo('POST', '/smtp/email', {
            sender: { email: env.MAIL_FROM_ADDRESS, name: env.MAIL_FROM_NAME || 'Campus' },
            to: [{ email: to }],
            templateId: id,
            params: SAMPLES[name],
            tags: ['prueba-plantillas'],
        });
        console.log(`SENT  ${label} "${tpl.name}" → ${to} (${messageId})`);
    } catch (e) {
        failed++;
        console.log(`FAIL  ${label} ${e.message}`);
    }
}
process.exitCode = failed ? 1 : 0;
