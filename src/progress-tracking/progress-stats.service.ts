import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';

/** Lo que el dashboard necesita saber de las inscripciones de un alumno. */
export interface CourseCounts {
  activos: number;
  completados: number;
}

@Injectable()
export class ProgressStatsService {
  constructor(
    @InjectRepository(LessonProgress)
    private readonly lessonProgressRepository: Repository<LessonProgress>,
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentsRepository: Repository<CourseEnrollment>,
  ) { }

  /**
   * Minutos estudiados: la suma de la duración de las lecciones que el usuario
   * completó.
   *
   * Es una estimación por diseño, no tiempo real de reproducción: si el alumno
   * marcó la lección como vista, se cuenta su duración. Trackear reproducción
   * real necesita heartbeats desde el player y es otra conversación.
   *
   * La suma la hace Postgres (un SUM, una fila de vuelta). Traer las lecciones
   * y sumarlas en JS sería traer cientos de filas para devolver un número.
   *
   * Se cuentan también las lecciones desactivadas después: el alumno las
   * estudió igual, y restarle horas ya ganadas porque el docente archivó una
   * lección sería raro de explicar.
   */
  async getStudiedMinutes(userId: string): Promise<number> {
    const result = await this.lessonProgressRepository
      .createQueryBuilder('progress')
      .innerJoin('progress.lesson', 'lesson')
      .innerJoin('progress.enrollment', 'enrollment')
      // Se navega por la relación en vez de asumir el nombre de la FK.
      .innerJoin('enrollment.student', 'student')
      .where('student.id = :userId', { userId })
      .andWhere('progress.completed = true')
      .select('COALESCE(SUM(lesson.durationMinutes), 0)', 'total')
      .getRawOne<{ total: string }>();

    // SUM() de Postgres vuelve como string (bigint): sin el Number() esto
    // terminaría concatenando en vez de sumando más arriba.
    return Number(result?.total ?? 0);
  }

  /**
   * Cuántas lecciones completó el alumno en total, en todos sus cursos.
   *
   * Un COUNT, sin traer las filas: lo usa la evaluación de logros, que corre
   * en cada lección completada.
   */
  async countCompletedLessons(userId: string): Promise<number> {
    return this.lessonProgressRepository
      .createQueryBuilder('progress')
      .innerJoin('progress.enrollment', 'enrollment')
      .innerJoin('enrollment.student', 'student')
      .where('student.id = :userId', { userId })
      .andWhere('progress.completed = true')
      .getCount();
  }

  /**
   * Cursos activos y completados del alumno, en una sola consulta.
   *
   * "Completado" es `progressPercent >= 100`, la misma columna derivada que
   * recalcula LessonProgressService cada vez que se marca o desmarca una
   * lección — no un conteo aparte que pueda decir otra cosa. "Activo" es todo
   * lo demás que siga vivo: inscripto y todavía sin terminar.
   *
   * Las inscripciones dadas de baja (`isActive = false`) no cuentan en ningún
   * lado.
   */
  async countCoursesByStatus(userId: string): Promise<CourseCounts> {
    const row = await this.enrollmentsRepository
      .createQueryBuilder('enrollment')
      .innerJoin('enrollment.student', 'student')
      .where('student.id = :userId', { userId })
      .andWhere('enrollment.isActive = true')
      .select(
        'COUNT(*) FILTER (WHERE enrollment.progressPercent >= 100)',
        'completados',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE enrollment.progressPercent < 100)',
        'activos',
      )
      .getRawOne<{ completados: string; activos: string }>();

    return {
      activos: Number(row?.activos ?? 0),
      completados: Number(row?.completados ?? 0),
    };
  }
}
