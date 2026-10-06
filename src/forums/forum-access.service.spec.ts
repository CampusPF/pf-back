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
  function makeService(allowed = true) {
    const canAccessCourseContent = jest.fn(async () => allowed);
    const service = new ForumAccessService({ canAccessCourseContent } as unknown as LessonsAccessService);
    return { service, canAccessCourseContent };
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

    it('el foro general es legible por cualquier usuario autenticado', async () => {
      const { service, canAccessCourseContent } = makeService(false);
      expect(await service.canRead({ id: 'anyone' }, generalThread())).toBe(true);
      expect(canAccessCourseContent).not.toHaveBeenCalled();
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
