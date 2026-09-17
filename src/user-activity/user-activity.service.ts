import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserActivity } from './entities/user-activity.entity';

/** Milisegundos en un día. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UserActivityService {
  constructor(
    @InjectRepository(UserActivity)
    private readonly userActivityRepository: Repository<UserActivity>,
  ) { }

  /**
   * Deja registrado que el usuario tuvo actividad HOY.
   *
   * Idempotente: se puede llamar mil veces en el día y queda una sola fila.
   * La idempotencia la da la base (índice único + ON CONFLICT DO NOTHING), no
   * un "select y si no existe, insert" — ese patrón tiene una carrera entre el
   * select y el insert, y dos requests simultáneos (que es exactamente lo que
   * pasa cuando el front dispara varios completados juntos) romperían con
   * violación de unique.
   */
  async registerActivityToday(userId: string): Promise<void> {
    await this.userActivityRepository
      .createQueryBuilder()
      .insert()
      .into(UserActivity)
      .values({ userId, date: this.today() })
      .orIgnore()
      .execute();
  }

  /**
   * Días consecutivos de actividad hasta hoy.
   *
   * Cuenta hacia atrás desde la actividad más reciente. Si esa actividad no es
   * de hoy ni de ayer, la racha ya está cortada y devuelve 0 — "ayer" cuenta
   * porque si no, la racha de todo el mundo aparecería en 0 hasta que estudien,
   * aunque vengan de veinte días seguidos.
   */
  async getCurrentStreak(userId: string): Promise<number> {
    // Solo la columna `date`: no hace falta traer ids ni el usuario.
    const rows = await this.userActivityRepository.find({
      select: { date: true },
      where: { userId },
      order: { date: 'DESC' },
    });

    if (rows.length === 0) return 0;

    const days = rows.map((row) => this.toUtcDate(row.date));

    const diffFromToday = this.diffInDays(this.toUtcDate(this.today()), days[0]);
    if (diffFromToday > 1) return 0;

    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = this.diffInDays(days[i - 1], days[i]);
      if (diff === 1) {
        streak++;
      } else if (diff === 0) {
        // El índice único lo impide, pero si alguna vez se cae ese índice
        // preferimos un duplicado ignorado antes que cortar la racha.
        continue;
      } else {
        break; // hueco: hasta acá llega la racha
      }
    }

    return streak;
  }

  /**
   * "Hoy" como 'YYYY-MM-DD', en UTC.
   *
   * Un solo lugar define qué día es hoy, y lo usan tanto la escritura como el
   * cálculo — si se dividiera en dos criterios distintos, la racha se cortaría
   * sola. Ojo con esto: es UTC, así que para un alumno en Argentina (UTC-3) lo
   * que estudie después de las 21:00 cuenta como el día siguiente. Para la demo
   * no molesta; el día que se quiera la racha en hora local, el huso del usuario
   * entra acá y en ningún otro lado.
   */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** 'YYYY-MM-DD' → Date a medianoche UTC. */
  private toUtcDate(day: string): Date {
    return new Date(`${day}T00:00:00.000Z`);
  }

  /** Días enteros entre dos medianoches UTC (later - earlier). */
  private diffInDays(later: Date, earlier: Date): number {
    return Math.round((later.getTime() - earlier.getTime()) / ONE_DAY_MS);
  }
}
