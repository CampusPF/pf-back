import { ConfigService } from '@nestjs/config';

/**
 * FRONTEND_URL puede ser una LISTA separada por comas (se usa también para
 * CORS): para armar links hace falta una sola, se toma la primera. Mismo
 * criterio que el callback de Google en AuthController.
 */
export function frontendBaseUrl(config: ConfigService): string {
    const raw = config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return raw.split(',')[0].trim().replace(/\/$/, '');
}

/**
 * Logo de los mails. Los clientes de correo lo bajan por URL pública, así que
 * tiene que ser absoluta: por defecto el archivo de pf-front/public. MAIL_LOGO_URL
 * permite apuntarlo a otro lado (CDN) sin tocar código.
 */
export function mailLogoUrl(config: ConfigService): string {
    return config.get<string>('MAIL_LOGO_URL') || frontendUrl(config, '/logo-campus.png');
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
