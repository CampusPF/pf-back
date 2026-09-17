import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';

@Injectable()
export class ProgressStatsService {
  constructor(
    @InjectRepository(LessonProgress)
    private readonly lessonProgressRepository: Repository<LessonProgress>,
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
}
