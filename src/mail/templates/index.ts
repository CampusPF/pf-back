import { MailContext, MailParams, RenderedMail } from './layout';
import { resetPasswordEmail } from './reset-password.template';
import { welcomeStudentEmail } from './welcome-student.template';
import { welcomeTeacherEmail } from './welcome-teacher.template';
import { welcomeAdminEmail } from './welcome-admin.template';
import { courseEnrolledEmail } from './course-enrolled.template';
import { coursePurchasedEmail } from './course-purchased.template';
import { courseCompletedEmail } from './course-completed.template';
import { certificateEmail } from './certificate.template';
import { premiumConfirmedEmail } from './premium-confirmed.template';
import { studentReminderEmail } from './student-reminder.template';
import { teacherNewStudentEmail } from './teacher-new-student.template';
import { teacherReminderEmail } from './teacher-reminder.template';
import { roleChangedEmail } from './role-changed.template'; 

export type { MailContext, MailParams, RenderedMail } from './layout';

/** Los mails transaccionales de la app. Cada valor es el nombre de su plantilla. */
export enum MailTemplate {
    RESET_PASSWORD = 'reset-password',
    WELCOME_STUDENT = 'welcome-student',
    WELCOME_TEACHER = 'welcome-teacher',
    WELCOME_ADMIN = 'welcome-admin',
    COURSE_ENROLLED = 'course-enrolled',
    COURSE_PURCHASED = 'course-purchased',
    COURSE_COMPLETED = 'course-completed',
    CERTIFICATE = 'certificate',
    PREMIUM_CONFIRMED = 'premium-confirmed',
    STUDENT_REMINDER = 'student-reminder',
    TEACHER_NEW_STUDENT = 'teacher-new-student',
    TEACHER_REMINDER = 'teacher-reminder',
    ROLE_CHANGED = 'role-changed',
}

type Renderer = (params: MailParams, ctx: MailContext) => RenderedMail;

/** Record (no Map/switch): TypeScript obliga a que cada MailTemplate tenga su render. */
const RENDERERS: Record<MailTemplate, Renderer> = {
    [MailTemplate.RESET_PASSWORD]: resetPasswordEmail,
    [MailTemplate.WELCOME_STUDENT]: welcomeStudentEmail,
    [MailTemplate.WELCOME_TEACHER]: welcomeTeacherEmail,
    [MailTemplate.WELCOME_ADMIN]: welcomeAdminEmail,
    [MailTemplate.COURSE_ENROLLED]: courseEnrolledEmail,
    [MailTemplate.COURSE_PURCHASED]: coursePurchasedEmail,
    [MailTemplate.COURSE_COMPLETED]: courseCompletedEmail,
    [MailTemplate.CERTIFICATE]: certificateEmail,
    [MailTemplate.PREMIUM_CONFIRMED]: premiumConfirmedEmail,
    [MailTemplate.STUDENT_REMINDER]: studentReminderEmail,
    [MailTemplate.TEACHER_NEW_STUDENT]: teacherNewStudentEmail,
    [MailTemplate.TEACHER_REMINDER]: teacherReminderEmail,
    [MailTemplate.ROLE_CHANGED]: roleChangedEmail,
};

/** Genera el asunto y el HTML final de un mail. Función pura, sin red. */
export function renderMail(
    template: MailTemplate,
    params: MailParams,
    ctx: MailContext,
): RenderedMail {
    return RENDERERS[template](params, ctx);
}
