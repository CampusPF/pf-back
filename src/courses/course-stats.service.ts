import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CourseReview } from '../course-reviews/entities/course-review.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { roundRating } from '../course-reviews/course-reviews.service';

export interface CourseStats {
  /** Promedio con un decimal; `null` si el curso no tiene reseñas. */
  ratingAverage: number | null;
  reviewsCount: number;
  /** Inscripciones activas. */
  studentsCount: number;
  /** Lecciones vivas (de módulos vivos). El catálogo no trae el temario. */
  lessonsCount: number;
  /**
   * Suma de la duración de las lecciones vivas, en minutos (0 si ninguna la
   * tiene cargada). Es lo que el catálogo muestra como "12 h · 24 lecciones";
   * el front lo formatea, acá viaja crudo.
   */
  totalDurationMinutes: number;
}

const EMPTY_STATS: CourseStats = {
  ratingAverage: null,
  reviewsCount: 0,
  studentsCount: 0,
  lessonsCount: 0,
  totalDurationMinutes: 0,
};

/**
 * Agregados que muestra el catálogo por curso: valoración, popularidad y
 * tamaño del contenido.
 *
 * Son TRES consultas agrupadas para todo el listado, no tres por curso: con N
 * cursos, pedir las stats de a uno sería 3N queries en cada GET /courses.
 * Nada de esto se guarda en `courses` (ver CourseReview).
 */
@Injectable()
export class CourseStatsService {
  constructor(
    @InjectRepository(CourseReview)
    private readonly reviewsRepository: Repository<CourseReview>,
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentsRepository: Repository<CourseEnrollment>,
    @InjectRepository(Lesson)
    private readonly lessonsRepository: Repository<Lesson>,
  ) { }

  async getStats(courseIds: string[]): Promise<Map<string, CourseStats>> {
    const stats = new Map<string, CourseStats>();
    if (courseIds.length === 0) return stats;

    const [reviewRows, enrollmentRows, lessonRows] = await Promise.all([
      this.reviewsRepository
        .createQueryBuilder('review')
        .select('review.courseId', 'courseId')
        .addSelect('AVG(review.rating)', 'average')
        .addSelect('COUNT(*)', 'count')
        .where({ courseId: In(courseIds) })
        .groupBy('review.courseId')
        .getRawMany<{ courseId: string; average: string; count: string }>(),
      this.enrollmentsRepository
        .createQueryBuilder('enrollment')
        // Se navega por la relación en vez de asumir el nombre de la FK.
        .innerJoin('enrollment.course', 'course')
        .select('course.id', 'courseId')
        .addSelect('COUNT(*)', 'count')
        .where('course.id IN (:...courseIds)', { courseIds })
        .andWhere('enrollment.isActive = true')
        .groupBy('course.id')
        .getRawMany<{ courseId: string; count: string }>(),
      // Mismo criterio de "vivo" que CertificatesService.courseHours: una
      // lección dada de baja, o de un módulo dado de baja, no cuenta.
      this.lessonsRepository
        .createQueryBuilder('lesson')
        .innerJoin('lesson.module', 'module')
        .innerJoin('module.course', 'course')
        .select('course.id', 'courseId')
        .addSelect('COUNT(lesson.id)', 'count')
        .addSelect('COALESCE(SUM(lesson.durationMinutes), 0)', 'minutes')
        .where('course.id IN (:...courseIds)', { courseIds })
        .andWhere('lesson.isActive = true')
        .andWhere('module.isActive = true')
        .groupBy('course.id')
        .getRawMany<{ courseId: string; count: string; minutes: string }>(),
    ]);

    for (const id of courseIds) stats.set(id, { ...EMPTY_STATS });

    // AVG, COUNT y SUM de Postgres vuelven como string (numeric / bigint).
    for (const row of reviewRows) {
      const current = stats.get(row.courseId);
      if (!current) continue;
      current.ratingAverage = roundRating(Number(row.average));
      current.reviewsCount = Number(row.count);
    }
    for (const row of enrollmentRows) {
      const current = stats.get(row.courseId);
      if (current) current.studentsCount = Number(row.count);
    }
    for (const row of lessonRows) {
      const current = stats.get(row.courseId);
      if (!current) continue;
      current.lessonsCount = Number(row.count);
      current.totalDurationMinutes = Number(row.minutes);
    }

    return stats;
  }

  /** Mezcla las stats en cada curso de la respuesta. */
  async withStats<T extends { id: string }>(courses: T[]): Promise<(T & CourseStats)[]> {
    const stats = await this.getStats(courses.map((course) => course.id));
    return courses.map((course) => ({ ...course, ...(stats.get(course.id) ?? EMPTY_STATS) }));
  }
}
