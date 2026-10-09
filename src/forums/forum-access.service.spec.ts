import { ForumAccessService } from './forum-access.service';
import { ForumThread } from './entities/forum-thread.entity';
import { Course } from '../courses/entities/course.entity';
import { UserRole } from '../users/entities/user.entity';
import { LessonsAccessService } from '../lessons/lessons-access.service';

const INSTRUCTOR_ID = 'teacher-1';

function courseThread(course: Partial<Course> = {}): ForumThread {
  return {
    id: 'thread-1',
    courseId: 'course-1',
    course: { id: 'course-1', isActive: true, instructor: { id: INSTRUCTOR_ID }, ...course } as Course,
  } as ForumThread;
}

function generalThread(): ForumThread {
  return { id: 'thread-2', courseId: null, course: null } as unknown as ForumThread;
}

describe('ForumAccessService', () => {
  function makeService(
    allowed = true,
    general: { hasActiveSubscription?: boolean; hasAnyActiveEnrollment?: boolean } = {},
  ) {
    const canAccessCourseContent = jest.fn(async () => allowed);
    const hasActiveSubscription = jest.fn(async () => general.hasActiveSubscription ?? false);
    const hasAnyActiveEnrollment = jest.fn(async () => general.hasAnyActiveEnrollment ?? false);
    const service = new ForumAccessService(
      { canAccessCourseContent } as unknown as LessonsAccessService,
      { hasAnyActiveEnrollment } as any,
      { hasActiveSubscription } as any,
    );
    return { service, canAccessCourseContent, hasActiveSubscription, hasAnyActiveEnrollment };
  }

  describe('canRead / canUseCourseForum', () => {
    it('delega en la regla de acceso al contenido del curso', async () => {
      const { service, canAccessCourseContent } = makeService(true);
      const thread = courseThread();
      expect(await service.canRead({ id: 'student-1' }, thread)).toBe(true);
      expect(canAccessCourseContent).toHaveBeenCalledWith({ id: 'student-1' }, thread.course);
    });

    it('un no inscripto no entra al foro del curso', async () => {
      const { service } = makeService(false);
      expect(await service.canRead({ id: 'stranger' }, courseThread())).toBe(false);
    });

    it('un curso desactivado no tiene foro accesible, ni siquiera para quien lo dicta', async () => {
      const { service, canAccessCourseContent } = makeService(true);
      const thread = courseThread({ isActive: false });
      expect(await service.canRead({ id: INSTRUCTOR_ID }, thread)).toBe(false);
      expect(canAccessCourseContent).not.toHaveBeenCalled();
    });

    it('el foro general no es legible por un alumno sin suscripción ni cursos comprados', async () => {
      const { service, canAccessCourseContent } = makeService(false);
      expect(await service.canRead({ id: 'nobody', role: UserRole.STUDENT }, generalThread())).toBe(false);
      expect(canAccessCourseContent).not.toHaveBeenCalled();
    });

    it('el foro general es legible por un alumno con suscripción activa', async () => {
      const { service } = makeService(false, { hasActiveSubscription: true });
      expect(await service.canRead({ id: 'subscriber', role: UserRole.STUDENT }, generalThread())).toBe(true);
    });

    it('el foro general es legible por un alumno con algún curso comprado', async () => {
      const { service } = makeService(false, { hasAnyActiveEnrollment: true });
      expect(await service.canRead({ id: 'buyer', role: UserRole.STUDENT }, generalThread())).toBe(true);
    });

    it('el foro general siempre es legible por el admin y el docente', async () => {
      const { service } = makeService(false);
      expect(await service.canRead({ id: 'admin-1', role: UserRole.ADMIN }, generalThread())).toBe(true);
      expect(await service.canRead({ id: 'teacher-1', role: UserRole.TEACHER }, generalThread())).toBe(true);
    });
  });

  describe('canModerate', () => {
    it('el docente dueño del curso puede moderar su foro', () => {
      const { service } = makeService();
      expect(service.canModerate({ id: INSTRUCTOR_ID, role: UserRole.TEACHER }, courseThread())).toBe(true);
    });

    it('un docente de otro curso no puede moderar', () => {
      const { service } = makeService();
      expect(service.canModerate({ id: 'other-teacher', role: UserRole.TEACHER }, courseThread())).toBe(false);
    });

    it('un alumno no puede moderar', () => {
      const { service } = makeService();
      expect(service.canModerate({ id: 'student-1', role: UserRole.STUDENT }, courseThread())).toBe(false);
    });

    it('el admin modera cualquier foro, también el general', () => {
      const { service } = makeService();
      const admin = { id: 'admin-1', role: UserRole.ADMIN };
      expect(service.canModerate(admin, courseThread())).toBe(true);
      expect(service.canModerate(admin, generalThread())).toBe(true);
    });

    it('en el foro general sólo el admin modera', () => {
      const { service } = makeService();
      expect(service.canModerate({ id: INSTRUCTOR_ID, role: UserRole.TEACHER }, generalThread())).toBe(false);
    });
  });
});
