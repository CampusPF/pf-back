import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CourseReviewsService, roundRating } from './course-reviews.service';
import { CourseReview } from './entities/course-review.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';

/**
 * Lo que importa blindar son las reglas de quién puede reseñar (inscripto, no
 * instructor) y la aritmética del resumen. Repositorios mockeados: no hace
 * falta base para verificar la regla.
 */
describe('CourseReviewsService', () => {
  let service: CourseReviewsService;
  let courseFindOne: jest.Mock;
  let hasActiveEnrollment: jest.Mock;
  let upsert: jest.Mock;
  let reviewFindOne: jest.Mock;
  let getRawMany: jest.Mock;
  let remove: jest.Mock;

  const COURSE_ID = 'c1';
  const INSTRUCTOR_ID = 'teacher';
  const STUDENT_ID = 'student';

  const savedReview = {
    id: 'r1',
    rating: 4,
    comment: 'Bueno',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: STUDENT_ID, name: 'Ana', avatarUrl: null, email: 'ana@x.com' },
  };

  beforeEach(async () => {
    courseFindOne = jest.fn().mockResolvedValue({ id: COURSE_ID, instructor: { id: INSTRUCTOR_ID } });
    hasActiveEnrollment = jest.fn().mockResolvedValue(true);
    upsert = jest.fn().mockResolvedValue(undefined);
    reviewFindOne = jest.fn().mockResolvedValue(null);
    getRawMany = jest.fn().mockResolvedValue([]);
    remove = jest.fn().mockResolvedValue({ affected: 1 });

    const queryBuilder = {
      select: () => queryBuilder,
      addSelect: () => queryBuilder,
      where: () => queryBuilder,
      groupBy: () => queryBuilder,
      getRawMany,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseReviewsService,
        {
          provide: getRepositoryToken(CourseReview),
          useValue: {
            upsert,
            findOne: reviewFindOne,
            findAndCount: jest.fn().mockResolvedValue([[], 0]),
            findOneOrFail: jest.fn().mockResolvedValue(savedReview),
            delete: remove,
            createQueryBuilder: () => queryBuilder,
          },
        },
        { provide: getRepositoryToken(Course), useValue: { findOne: courseFindOne } },
        { provide: CourseEnrollmentsService, useValue: { hasActiveEnrollment } },
      ],
    }).compile();

    service = module.get(CourseReviewsService);
  });

  describe('upsertMine', () => {
    it('guarda la reseña de un alumno inscripto y no expone su email', async () => {
      const view = await service.upsertMine(COURSE_ID, STUDENT_ID, { rating: 4, comment: 'Bueno' });

      expect(upsert).toHaveBeenCalledWith(
        { courseId: COURSE_ID, userId: STUDENT_ID, rating: 4, comment: 'Bueno' },
        { conflictPaths: ['userId', 'courseId'] },
      );
      expect(view.author).toEqual({ id: STUDENT_ID, name: 'Ana', avatarUrl: null });
    });

    it('rechaza con 403 a quien no está inscripto', async () => {
      hasActiveEnrollment.mockResolvedValue(false);

      await expect(service.upsertMine(COURSE_ID, STUDENT_ID, { rating: 5 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });

    it('no deja que el instructor reseñe su propio curso, aunque esté inscripto', async () => {
      await expect(service.upsertMine(COURSE_ID, INSTRUCTOR_ID, { rating: 5 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });

    it('guarda un comentario vacío o de espacios como null', async () => {
      await service.upsertMine(COURSE_ID, STUDENT_ID, { rating: 3, comment: '   ' });
      expect(upsert.mock.calls[0][0].comment).toBeNull();
    });

    it('guarda cualquier comentario tal cual, sin moderarlo', async () => {
      await service.upsertMine(COURSE_ID, STUDENT_ID, { rating: 1, comment: '  cualquier cosa  ' });
      expect(upsert.mock.calls[0][0].comment).toBe('cualquier cosa');
    });

    it('devuelve 404 si el curso no existe o está inactivo', async () => {
      courseFindOne.mockResolvedValue(null);
      await expect(service.upsertMine(COURSE_ID, STUDENT_ID, { rating: 5 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findMine', () => {
    it('informa el motivo cuando no puede reseñar', async () => {
      hasActiveEnrollment.mockResolvedValue(false);
      await expect(service.findMine(COURSE_ID, STUDENT_ID)).resolves.toEqual({
        canReview: false,
        reason: 'not_enrolled',
        review: null,
      });
    });
  });

  describe('removeMine', () => {
    it('devuelve 404 si no había reseña propia', async () => {
      remove.mockResolvedValue({ affected: 0 });
      await expect(service.removeMine(COURSE_ID, STUDENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resumen', () => {
    it('calcula promedio, total y distribución con las 5 claves', async () => {
      // COUNT(*) llega como string desde Postgres.
      getRawMany.mockResolvedValue([
        { rating: 5, count: '2' },
        { rating: 4, count: '1' },
      ]);

      const page = await service.findByCourse(COURSE_ID);
      expect(page.summary).toEqual({
        average: 4.7,
        count: 3,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 },
      });
    });

    it('sin reseñas el promedio es null, no 0', async () => {
      const page = await service.findByCourse(COURSE_ID);
      expect(page.summary.average).toBeNull();
      expect(page.summary.count).toBe(0);
    });
  });

  it('roundRating redondea a un decimal', () => {
    expect(roundRating(4.666)).toBe(4.7);
    expect(roundRating(null)).toBeNull();
  });
});
