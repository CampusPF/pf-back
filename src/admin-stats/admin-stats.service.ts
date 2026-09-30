import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/entities/user.entity';
import type { StatsRange } from './dto/admin-stats.query';

/** Un valor del período elegido contra el período anterior de igual largo. */
export interface PeriodMetric {
  current: number;
  previous: number;
}

export interface AdminStats {
  scope: 'platform' | 'teacher';
  range: { days: StatsRange; from: string; to: string };
  currency: string;
  totals: {
    /** Sólo admin (null para el docente). Usuarios no borrados. */
    users: number | null;
    /** Admin: alumnos de la plataforma. Docente: alumnos distintos en sus cursos. */
    students: number;
    /** Sólo admin. */
    teachers: number | null;
    courses: number;
    activeCourses: number;
    /** Sólo admin. */
    categories: number | null;
    /** Inscripciones vigentes (no dadas de baja). */
    enrollments: number;
    completedEnrollments: number;
    /** Sólo admin: la suscripción es plata de la plataforma, no de un docente. */
    activeSubscriptions: number | null;
    revenueCents: number;
    reviews: number;
    /** Un decimal; null sin reseñas. */
    averageRating: number | null;
  };
  period: {
    /** Admin: usuarios registrados. Docente: alumnos que se sumaron a sus cursos. */
    newStudents: PeriodMetric;
    enrollments: PeriodMetric;
    completions: PeriodMetric;
    revenueCents: PeriodMetric;
  };
  /** Un punto por día del rango, INCLUIDOS los días en cero. */
  enrollmentsByDay: { date: string; count: number }[];
  /** Últimos 12 meses, incluidos los meses en cero. */
  revenueByMonth: { month: string; courseCents: number; subscriptionCents: number }[];
  /** Top 5 por inscripciones dentro del período. */
  topCourses: { id: string; title: string; enrollments: number }[];
  recentEnrollments: { id: string; studentName: string; courseTitle: string; enrolledAt: string }[];
}

type Row = Record<string, string | number | null>;

const num = (value: string | number | null | undefined): number => Number(value ?? 0);

/**
 * Métricas del panel de administración, agregadas en la base.
 *
 * Reemplaza lo que hacía el front: pedir los listados COMPLETOS de usuarios,
 * cursos, inscripciones y suscripciones y contarlos con `.length`. Acá cada
 * número es un COUNT/SUM, y las series salen agrupadas por día o por mes.
 *
 * Alcance según el rol, con las MISMAS consultas: el admin ve la plataforma;
 * el docente, sólo sus cursos (`$3` = su id; null para el admin). Así no hay
 * dos versiones de cada query que se desincronicen.
 *
 * Fechas: las columnas son `timestamp` sin zona, escritas por `now()` en la
 * zona de la sesión de Postgres. Se convierten a la zona del negocio
 * (REMINDER_TZ, Buenos Aires por defecto) antes de agrupar por día: si no,
 * una inscripción de las 22 h aparecería en el día siguiente.
 */
@Injectable()
export class AdminStatsService {
  private readonly timezone: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.timezone = config.get<string>('REMINDER_TZ') ?? 'America/Argentina/Buenos_Aires';
  }

  async getStats(actor: { id: string; role: UserRole }, days: StatsRange): Promise<AdminStats> {
    const isAdmin = actor.role === UserRole.ADMIN;
    // El admin ve TODO, aunque también tenga cursos propios: es el reporte de
    // la plataforma, no "mis cursos" (mismo criterio que /teacher/payments).
    const params = [this.timezone, days, isAdmin ? null : actor.id];

    const [range, people, catalog, enrollments, revenue, reviews, byDay, byMonth, top, recent] =
      await Promise.all([
        this.one(RANGE_SQL, params),
        this.one(isAdmin ? PLATFORM_PEOPLE_SQL : TEACHER_PEOPLE_SQL, params),
        this.one(CATALOG_SQL, params),
        this.one(ENROLLMENTS_SQL, params),
        this.one(REVENUE_SQL, params),
        this.one(REVIEWS_SQL, params),
        this.many(ENROLLMENTS_BY_DAY_SQL, params),
        this.many(REVENUE_BY_MONTH_SQL, params),
        this.many(TOP_COURSES_SQL, params),
        this.many(RECENT_ENROLLMENTS_SQL, params),
      ]);

    return {
      scope: isAdmin ? 'platform' : 'teacher',
      range: { days, from: String(range.from), to: String(range.to) },
      currency: String(revenue.currency ?? 'usd'),
      totals: {
        users: isAdmin ? num(people.users) : null,
        students: num(people.students),
        teachers: isAdmin ? num(people.teachers) : null,
        courses: num(catalog.courses),
        activeCourses: num(catalog.active_courses),
        categories: isAdmin ? num(catalog.categories) : null,
        enrollments: num(enrollments.total),
        completedEnrollments: num(enrollments.completed),
        activeSubscriptions: isAdmin ? num(people.active_subscriptions) : null,
        revenueCents: num(revenue.total),
        reviews: num(reviews.count),
        // `== null` a propósito: avg() sin filas es null, y una fila ausente, undefined.
        averageRating:
          reviews.average == null ? null : Math.round(Number(reviews.average) * 10) / 10,
      },
      period: {
        newStudents: { current: num(people.new_current), previous: num(people.new_previous) },
        enrollments: {
          current: num(enrollments.new_current),
          previous: num(enrollments.new_previous),
        },
        completions: {
          current: num(enrollments.completed_current),
          previous: num(enrollments.completed_previous),
        },
        revenueCents: { current: num(revenue.current), previous: num(revenue.previous) },
      },
      enrollmentsByDay: byDay.map((r) => ({ date: String(r.date), count: num(r.count) })),
      revenueByMonth: byMonth.map((r) => ({
        month: String(r.month),
        courseCents: num(r.course_cents),
        subscriptionCents: num(r.subscription_cents),
      })),
      topCourses: top.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        enrollments: num(r.enrollments),
      })),
      recentEnrollments: recent.map((r) => ({
        id: String(r.id),
        studentName: String(r.student_name ?? 'Alumno'),
        courseTitle: String(r.course_title ?? '—'),
        enrolledAt: new Date(r.enrolled_at as string).toISOString(),
      })),
    };
  }

  private async one(sql: string, params: unknown[]): Promise<Row> {
    const rows = await this.many(sql, params);
    return rows[0] ?? {};
  }

  private many(sql: string, params: unknown[]): Promise<Row[]> {
    return this.dataSource.query<Row[]>(withParams(sql), params);
  }
}

/* ── SQL ───────────────────────────────────────────────────────────────
   Parámetros comunes: $1 zona horaria, $2 días del rango, $3 id del docente
   (null = toda la plataforma).

   Período actual:   [hoy - ($2 - 1), hoy]        (días locales, incluye hoy)
   Período anterior: [hoy - (2·$2 - 1), hoy - $2]  (mismo largo, pegado atrás) */

/**
 * Antepone un CTE que declara los tres parámetros con su tipo. Postgres
 * rechaza un parámetro que la consulta no usa ("could not determine data
 * type of parameter $3"), y no todas usan los tres: así todas los mencionan
 * y cada consulta queda escrita sólo con lo que necesita.
 */
export function withParams(sql: string): string {
  const params = '_params AS (SELECT $1::text AS tz, $2::int AS days, $3::uuid AS instructor)';
  const body = sql.trim();
  return body.startsWith('WITH ')
    ? `WITH ${params}, ${body.slice('WITH '.length)}`
    : `WITH ${params} ${body}`;
}

/** Fecha local (en $1) de una columna `timestamp` escrita por now(). */
const local = (column: string) =>
  `((${column}) AT TIME ZONE current_setting('TimeZone') AT TIME ZONE $1::text)::date`;

const TODAY = `(now() AT TIME ZONE $1::text)::date`;
const inCurrent = (column: string) => `${local(column)} > ${TODAY} - $2::int`;
const inPrevious = (column: string) =>
  `(${local(column)} > ${TODAY} - 2 * $2::int AND ${local(column)} <= ${TODAY} - $2::int)`;

/** Filtro de alcance sobre la tabla de cursos con alias `c`. */
const SCOPE = `($3::uuid IS NULL OR c."instructorId" = $3::uuid)`;

const RANGE_SQL = `
  SELECT to_char(${TODAY} - ($2::int - 1), 'YYYY-MM-DD') AS "from",
         to_char(${TODAY}, 'YYYY-MM-DD')                 AS "to"`;

const PLATFORM_PEOPLE_SQL = `
  SELECT
    count(*) FILTER (WHERE u.status <> 'deleted')                                 AS users,
    count(*) FILTER (WHERE u.status <> 'deleted' AND u.role = 'student')          AS students,
    count(*) FILTER (WHERE u.status <> 'deleted' AND u.role = 'teacher')          AS teachers,
    count(*) FILTER (WHERE u.status <> 'deleted' AND ${inCurrent('u."createdAt"')})  AS new_current,
    count(*) FILTER (WHERE u.status <> 'deleted' AND ${inPrevious('u."createdAt"')}) AS new_previous,
    -- Misma regla que SubscriptionsService.hasActiveSubscription: ACTIVE o
    -- CANCELLED todavía dentro de su período pago (cancelar apaga la
    -- renovación, no el período ya pagado). Si cambia una, cambia la otra.
    (SELECT count(*) FROM subscriptions s
       WHERE s.status IN ('active', 'cancelled') AND s.end_date > now())        AS active_subscriptions
  FROM users u`;

/** Para el docente, "alumno nuevo" = primera inscripción a alguno de SUS cursos. */
const TEACHER_PEOPLE_SQL = `
  WITH firsts AS (
    SELECT e."studentId", min(e.enrolled_at) AS first_at
    FROM course_enrollments e
    JOIN courses c ON c.id = e."courseId"
    WHERE ${SCOPE}
    GROUP BY e."studentId"
  )
  SELECT
    count(*)                                              AS students,
    count(*) FILTER (WHERE ${inCurrent('first_at')})      AS new_current,
    count(*) FILTER (WHERE ${inPrevious('first_at')})     AS new_previous
  FROM firsts`;

const CATALOG_SQL = `
  SELECT
    count(*)                             AS courses,
    count(*) FILTER (WHERE c."isActive") AS active_courses,
    (SELECT count(*) FROM categories)    AS categories
  FROM courses c
  WHERE ${SCOPE}`;

const ENROLLMENTS_SQL = `
  SELECT
    count(*) FILTER (WHERE e."isActive")                                  AS total,
    count(*) FILTER (WHERE e."isActive" AND e.completed_at IS NOT NULL)   AS completed,
    count(*) FILTER (WHERE ${inCurrent('e.enrolled_at')})                 AS new_current,
    count(*) FILTER (WHERE ${inPrevious('e.enrolled_at')})                AS new_previous,
    count(*) FILTER (WHERE e.completed_at IS NOT NULL AND ${inCurrent('e.completed_at')})  AS completed_current,
    count(*) FILTER (WHERE e.completed_at IS NOT NULL AND ${inPrevious('e.completed_at')}) AS completed_previous
  FROM course_enrollments e
  JOIN courses c ON c.id = e."courseId"
  WHERE ${SCOPE}`;

/**
 * Sólo pagos cobrados. Para el docente, sólo ventas de SUS cursos (las
 * suscripciones son de la plataforma); LEFT JOIN porque un pago de
 * suscripción no tiene curso.
 */
const REVENUE_SQL = `
  SELECT
    coalesce(sum(p.amount_in_cents), 0)                                         AS total,
    coalesce(sum(p.amount_in_cents) FILTER (WHERE ${inCurrent('p.created_at')}), 0)  AS current,
    coalesce(sum(p.amount_in_cents) FILTER (WHERE ${inPrevious('p.created_at')}), 0) AS previous,
    mode() WITHIN GROUP (ORDER BY p.currency)                                   AS currency
  FROM payments p
  LEFT JOIN courses c ON c.id = p."courseId"
  WHERE p.status = 'succeeded'
    AND ($3::uuid IS NULL OR (p.type = 'course' AND c."instructorId" = $3::uuid))`;

const REVIEWS_SQL = `
  SELECT count(*) AS count, avg(r.rating) AS average
  FROM course_reviews r
  JOIN courses c ON c.id = r.course_id
  WHERE ${SCOPE}`;

const ENROLLMENTS_BY_DAY_SQL = `
  WITH days AS (
    SELECT generate_series(${TODAY} - ($2::int - 1), ${TODAY}, interval '1 day')::date AS day
  ),
  counts AS (
    SELECT ${local('e.enrolled_at')} AS day, count(*) AS count
    FROM course_enrollments e
    JOIN courses c ON c.id = e."courseId"
    WHERE ${SCOPE} AND ${inCurrent('e.enrolled_at')}
    GROUP BY 1
  )
  SELECT to_char(d.day, 'YYYY-MM-DD') AS date, coalesce(k.count, 0) AS count
  FROM days d LEFT JOIN counts k ON k.day = d.day
  ORDER BY d.day`;

const REVENUE_BY_MONTH_SQL = `
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', ${TODAY}) - interval '11 months',
      date_trunc('month', ${TODAY}),
      interval '1 month'
    )::date AS month
  ),
  sums AS (
    SELECT date_trunc('month', ${local('p.created_at')})::date AS month,
           sum(p.amount_in_cents) FILTER (WHERE p.type = 'course')       AS course_cents,
           sum(p.amount_in_cents) FILTER (WHERE p.type = 'subscription') AS subscription_cents
    FROM payments p
    LEFT JOIN courses c ON c.id = p."courseId"
    WHERE p.status = 'succeeded'
      AND ($3::uuid IS NULL OR (p.type = 'course' AND c."instructorId" = $3::uuid))
      AND ${local('p.created_at')} >= date_trunc('month', ${TODAY}) - interval '11 months'
    GROUP BY 1
  )
  SELECT to_char(m.month, 'YYYY-MM') AS month,
         coalesce(s.course_cents, 0)       AS course_cents,
         coalesce(s.subscription_cents, 0) AS subscription_cents
  FROM months m LEFT JOIN sums s ON s.month = m.month
  ORDER BY m.month`;

const TOP_COURSES_SQL = `
  SELECT c.id, c.title, count(*) AS enrollments
  FROM course_enrollments e
  JOIN courses c ON c.id = e."courseId"
  WHERE ${SCOPE} AND ${inCurrent('e.enrolled_at')}
  GROUP BY c.id, c.title
  ORDER BY enrollments DESC, c.title
  LIMIT 5`;

const RECENT_ENROLLMENTS_SQL = `
  SELECT e.id, e.enrolled_at, u.name AS student_name, c.title AS course_title
  FROM course_enrollments e
  JOIN courses c ON c.id = e."courseId"
  JOIN users u ON u.id = e."studentId"
  WHERE ${SCOPE}
  ORDER BY e.enrolled_at DESC
  LIMIT 5`;
