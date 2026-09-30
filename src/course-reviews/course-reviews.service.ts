import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseReview } from './entities/course-review.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';
import { UpsertCourseReviewDto } from './dto/upsert-course-review.dto';
import { ModerationService } from '../moderation/moderation.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/** Lo que se expone de una reseña: el autor sin email, rol ni nada privado. */
export interface CourseReviewView {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; avatarUrl: string | null };
}

export interface CourseReviewsSummary {
  /** Promedio con un decimal; `null` si todavía no hay reseñas. */
  average: number | null;
  count: number;
  /** Cantidad de reseñas por puntaje, siempre con las 5 claves. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface CourseReviewsPage {
  data: CourseReviewView[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  summary: CourseReviewsSummary;
}

/**
 * Por qué el usuario no puede reseñar. El front arma el mensaje con esto.
 *
 * `not_completed`: está inscripto pero todavía no terminó el curso. Se reseña
 * lo que se cursó entero, sin excepciones (tampoco el admin: no está inscripto,
 * así que cae en `not_enrolled`).
 */
export type CannotReviewReason = 'not_enrolled' | 'not_completed' | 'own_course';

export interface MyCourseReview {
  canReview: boolean;
  reason: CannotReviewReason | null;
  review: CourseReviewView | null;
}

@Injectable()
export class CourseReviewsService {
  constructor(
    @InjectRepository(CourseReview)
    private readonly reviewsRepository: Repository<CourseReview>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    private readonly enrollmentsService: CourseEnrollmentsService,
    private readonly moderationService: ModerationService,
  ) { }

  /** Listado público paginado + resumen (promedio y distribución). */
  async findByCourse(
    courseId: string,
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
  ): Promise<CourseReviewsPage> {
    await this.getActiveCourse(courseId);

    const [reviews, total] = await this.reviewsRepository.findAndCount({
      where: { courseId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: reviews.map(toView),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      summary: await this.getSummary(courseId),
    };
  }

  /** La reseña propia y si se puede escribir una (para armar el formulario). */
  async findMine(courseId: string, userId: string): Promise<MyCourseReview> {
    const course = await this.getActiveCourse(courseId);
    const reason = await this.cannotReviewReason(course, userId);

    const review = await this.reviewsRepository.findOne({
      where: { courseId, userId },
      relations: { user: true },
    });

    return { canReview: reason === null, reason, review: review ? toView(review) : null };
  }

  /**
   * Crea o edita la reseña propia. Requiere inscripción activa **y el curso
   * terminado**; el instructor no puede reseñar el suyo.
   *
   * El comentario pasa por ModerationService (lista local + IA de Groq)
   * antes de guardarse: si es ofensivo, 422 y no se escribe nada. Las
   * críticas negativas respetuosas se publican. Se modera DESPUÉS de los
   * permisos, para no gastar una llamada a la IA con quien no puede reseñar.
   *
   * El upsert es por (user, course) con ON CONFLICT: dos envíos simultáneos
   * (doble click) no pueden terminar en violación de unique, igual que el
   * registro de actividad diaria.
   */
  async upsertMine(
    courseId: string,
    userId: string,
    dto: UpsertCourseReviewDto,
  ): Promise<CourseReviewView> {
    const course = await this.getActiveCourse(courseId);
    const reason = await this.cannotReviewReason(course, userId);

    if (reason === 'own_course') {
      throw new ForbiddenException('No podés reseñar un curso que dictás vos.');
    }
    if (reason === 'not_enrolled') {
      throw new ForbiddenException('Tenés que estar inscripto al curso para dejar una reseña.');
    }
    if (reason === 'not_completed') {
      throw new ForbiddenException('Podés reseñar el curso cuando lo termines.');
    }

    // Espacios solos = sin comentario: no guardamos strings vacíos.
    const comment = dto.comment?.trim() || null;

    // Un puntaje sin comentario no tiene nada que moderar.
    if (comment) await this.moderationService.assertPublishable(comment);

    await this.reviewsRepository.upsert(
      {
        courseId,
        userId,
        rating: dto.rating,
        comment,
      },
      { conflictPaths: ['userId', 'courseId'] },
    );

    const saved = await this.reviewsRepository.findOneOrFail({
      where: { courseId, userId },
      relations: { user: true },
    });
    return toView(saved);
  }

  /**
   * Borra la reseña propia. No pide inscripción activa: quien se dio de baja
   * del curso tiene que poder retirar lo que opinó.
   */
  async removeMine(courseId: string, userId: string): Promise<void> {
    const result = await this.reviewsRepository.delete({ courseId, userId });
    if (!result.affected) {
      throw new NotFoundException('No tenés una reseña en este curso.');
    }
  }

  private async getActiveCourse(courseId: string): Promise<Course> {
    const course = await this.coursesRepository.findOne({
      where: { id: courseId, isActive: true },
      relations: { instructor: true },
    });
    if (!course) {
      throw new NotFoundException(`Curso con id ${courseId} no encontrado`);
    }
    return course;
  }

  private async cannotReviewReason(
    course: Course,
    userId: string,
  ): Promise<CannotReviewReason | null> {
    if (course.instructor?.id === userId) return 'own_course';

    const enrolled = await this.enrollmentsService.hasActiveEnrollment(userId, course.id);
    if (!enrolled) return 'not_enrolled';

    /* Terminar el curso es condición para reseñarlo, sin excepción: opina
       quien lo hizo entero (lecciones al 100% y checkpoints aprobados). */
    const completed = await this.enrollmentsService.hasCompletedCourse(userId, course.id);
    return completed ? null : 'not_completed';
  }

  /** Promedio, total y distribución en una sola consulta agrupada. */
  private async getSummary(courseId: string): Promise<CourseReviewsSummary> {
    const rows = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('review.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('review.courseId = :courseId', { courseId })
      .groupBy('review.rating')
      .getRawMany<{ rating: number | string; count: string }>();

    const distribution: CourseReviewsSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let count = 0;
    let sum = 0;

    for (const row of rows) {
      const rating = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      // COUNT(*) de Postgres vuelve como string (bigint).
      const n = Number(row.count);
      distribution[rating] = n;
      count += n;
      sum += rating * n;
    }

    return { average: roundRating(count ? sum / count : null), count, distribution };
  }
}

/** Promedio a un decimal (4.666… → 4.7). */
export function roundRating(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function toView(review: CourseReview): CourseReviewView {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    author: {
      id: review.user.id,
      name: review.user.name,
      avatarUrl: review.user.avatarUrl ?? null,
    },
  };
}
