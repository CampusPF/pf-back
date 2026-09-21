export * from './lesson-completed.event';
export * from './course-completed.event';
export * from './quiz-passed.event';
export * from './certificate-issued.event';
export * from './user-registered.event';
export * from './course-enrolled.event';
export * from './payment-succeeded.event';

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
} as const;
