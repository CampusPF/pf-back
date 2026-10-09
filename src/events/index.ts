export * from './lesson-completed.event';
export * from './course-completed.event';
export * from './quiz-passed.event';
export * from './certificate-issued.event';
export * from './user-registered.event';
export * from './course-enrolled.event';
export * from './payment-succeeded.event';
export * from './course-renamed.event';
export * from './course-blocked-by-admin.event';
export * from './role-changed.event';
export * from './forum-thread-created.event';
export * from './forum-reply-created.event';
export * from './forum-solution-marked.event';
export * from './forum-post-updated.event';
export * from './forum-thread-changed.event';

/**
 * Los nombres de evento, en un solo lugar.
 *
 * El emisor y el listener viven en módulos distintos y se acoplan únicamente
 * por este string: si se escribe a mano en los dos lados, un typo no rompe la
 * compilación, simplemente el listener deja de dispararse en silencio.
 */
export const EVENTS = {
  LESSON_COMPLETED: 'lesson.completed',
  COURSE_COMPLETED: 'course.completed',
  QUIZ_PASSED: 'quiz.passed',
  CERTIFICATE_ISSUED: 'certificate.issued',
  USER_REGISTERED: 'user.registered',
  COURSE_ENROLLED: 'course.enrolled',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  COURSE_RENAMED: 'course.renamed',
  COURSE_BLOCKED_BY_ADMIN: 'course.blocked-by-admin',
  ROLE_CHANGED: 'user.role-changed',
  FORUM_THREAD_CREATED: 'forum.thread-created',
  FORUM_REPLY_CREATED: 'forum.reply-created',
  FORUM_SOLUTION_MARKED: 'forum.solution-marked',
  FORUM_POST_UPDATED: 'forum.post-updated',
  FORUM_THREAD_CHANGED: 'forum.thread-changed',
} as const;
