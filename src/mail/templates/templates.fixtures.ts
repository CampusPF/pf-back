import { MailTemplate } from './index';

/**
 * Datos de ejemplo de cada mail, para los tests y para email-templates/preview.ts.
 * Mismos params que mandan EmailNotificationsService / RemindersService / AuthService.
 */
export const SAMPLES: Record<MailTemplate, Record<string, unknown>> = {
    [MailTemplate.RESET_PASSWORD]: { name: 'Ana', resetUrl: 'https://campus.test/reset-password?token=x&y=1', expiresInMinutes: 60 },
    [MailTemplate.WELCOME_STUDENT]: { name: 'Ana', dashboardUrl: 'https://campus.test/dashboard', coursesUrl: 'https://campus.test/courses', setPasswordUrl: 'https://campus.test/reset-password?token=x' },
    [MailTemplate.WELCOME_TEACHER]: { name: 'Luis', dashboardUrl: 'https://campus.test/dashboard', createCourseUrl: 'https://campus.test/nuevo' },
    [MailTemplate.WELCOME_ADMIN]: { name: 'Marta', adminUrl: 'https://campus.test/admin' },
    [MailTemplate.COURSE_ENROLLED]: {
        name: 'Ana', courseTitle: 'Python desde cero', courseImageUrl: 'https://img.test/c.png',
        courseUrl: 'https://campus.test/courses/python', firstLessonUrl: 'https://campus.test/courses/python/learn/1',
        totalLessons: 3, totalMinutes: 25,
        modules: [
            { title: 'Módulo 1', lessons: [{ title: 'Qué es Python', duration: 10 }, { title: 'Instalación', duration: 0 }] },
            { title: 'Módulo 2', lessons: [{ title: 'Variables', duration: 15 }] },
        ],
    },
    [MailTemplate.COURSE_PURCHASED]: { name: 'Ana', courseTitle: 'Python desde cero', amount: '$ 15.000,00', paidAt: '21 de septiembre de 2026', paymentId: 'pay_1', firstLessonUrl: 'https://campus.test/courses/python', paymentsUrl: 'https://campus.test/pagos' },
    [MailTemplate.COURSE_COMPLETED]: { name: 'Ana', courseTitle: 'Python desde cero', coursesUrl: 'https://campus.test/courses', myCoursesUrl: 'https://campus.test/mis-cursos' },
    [MailTemplate.CERTIFICATE]: { name: 'Ana', courseTitle: 'Python desde cero', code: 'CERT-1', certificateUrl: 'https://campus.test/c/CERT-1', verifyUrl: 'https://campus.test/v/CERT-1' },
    [MailTemplate.PREMIUM_CONFIRMED]: { name: 'Ana', planName: 'Premium', amount: '$ 9.999,00', validUntil: '21 de octubre de 2026', coursesUrl: 'https://campus.test/courses', paymentsUrl: 'https://campus.test/pagos' },
    [MailTemplate.STUDENT_REMINDER]: {
        name: 'Ana', maxDaysInactive: 9, myCoursesUrl: 'https://campus.test/mis-cursos', unsubscribeUrl: 'https://api.test/unsubscribe?token=t',
        courses: [{ title: 'Python', daysInactive: 9, url: 'https://campus.test/courses/python' }],
    },
    [MailTemplate.TEACHER_NEW_STUDENT]: { teacherName: 'Luis', studentName: 'Ana', courseTitle: 'Python desde cero', totalStudents: 12, courseAdminUrl: 'https://campus.test/admin/1' },
    [MailTemplate.TEACHER_REMINDER]: { name: 'Luis', daysSinceLastCourse: 30, hasCourses: true, createCourseUrl: 'https://campus.test/nuevo', unsubscribeUrl: 'https://api.test/unsubscribe?token=t' },
    [MailTemplate.ROLE_CHANGED]: { name: 'Ana', previousRole: 'estudiante', newRole: 'docente', dashboardUrl: 'https://campus.test/dashboard',},
};
