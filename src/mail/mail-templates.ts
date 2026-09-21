import { ConfigService } from '@nestjs/config';

/**
 * Las plantillas transaccionales de Brevo. Cada valor es el NOMBRE de la env
 * var que guarda el ID numérico de la plantilla en Brevo.
 *
 * Flujo de diseño: la plantilla se arma en Stripo, se exporta a Brevo
 * (Stripo › Export › Brevo) y el ID que asigna Brevo se carga en la env var.
 * Los `params` que recibe cada una están documentados en el service que la
 * manda (EmailNotificationsService / RemindersService / AuthService).
 */
export enum MailTemplate {
    RESET_PASSWORD = 'BREVO_TPL_RESET_PASSWORD',
    WELCOME_STUDENT = 'BREVO_TPL_WELCOME_STUDENT',
    WELCOME_TEACHER = 'BREVO_TPL_WELCOME_TEACHER',
    WELCOME_ADMIN = 'BREVO_TPL_WELCOME_ADMIN',
    COURSE_ENROLLED = 'BREVO_TPL_COURSE_ENROLLED',
    COURSE_PURCHASED = 'BREVO_TPL_COURSE_PURCHASED',
    COURSE_COMPLETED = 'BREVO_TPL_COURSE_COMPLETED',
    CERTIFICATE = 'BREVO_TPL_CERTIFICATE',
    PREMIUM_CONFIRMED = 'BREVO_TPL_PREMIUM_CONFIRMED',
    STUDENT_REMINDER = 'BREVO_TPL_STUDENT_REMINDER',
    TEACHER_NEW_STUDENT = 'BREVO_TPL_TEACHER_NEW_STUDENT',
    TEACHER_REMINDER = 'BREVO_TPL_TEACHER_REMINDER',
}

/**
 * ID de la plantilla en Brevo. 0 si no está configurada: en dev es lo
 * esperable (MailService sólo loguea); en producción la env var es obligatoria
 * y la app ni siquiera arranca sin ella.
 */
export function templateId(config: ConfigService, template: MailTemplate): number {
    return Number(config.get(template) ?? 0);
}

/**
 * FRONTEND_URL puede ser una LISTA separada por comas (se usa también para
 * CORS): para armar links hace falta una sola, se toma la primera. Mismo
 * criterio que el callback de Google en AuthController.
 */
export function frontendBaseUrl(config: ConfigService): string {
    const raw = config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return raw.split(',')[0].trim().replace(/\/$/, '');
}

/** Link absoluto al front. `path` empieza con "/". */
export function frontendUrl(config: ConfigService, path: string): string {
    return `${frontendBaseUrl(config)}${path}`;
}

/** Rutas del front (pf-front/app) que se linkean desde los mails. */
export const FRONT_ROUTES = {
    dashboard: '/dashboard',
    myCourses: '/dashboard/mis-cursos',
    courses: '/courses',
    course: (slug: string) => `/courses/${encodeURIComponent(slug)}`,
    lesson: (slug: string, lessonId: string) =>
        `/courses/${encodeURIComponent(slug)}/learn/${encodeURIComponent(lessonId)}`,
    certificate: (code: string) => `/dashboard/certificados/${encodeURIComponent(code)}`,
    verifyCertificate: (code: string) => `/certificados/verificar/${encodeURIComponent(code)}`,
    resetPassword: (token: string) => `/reset-password?token=${encodeURIComponent(token)}`,
    admin: '/dashboard/admin',
    manageCourses: '/dashboard/admin/cursos',
    manageCourse: (courseId: string) => `/dashboard/admin/cursos/${encodeURIComponent(courseId)}`,
    newCourse: '/dashboard/admin/cursos/nuevo',
    payments: '/dashboard/configuracion',
} as const;
