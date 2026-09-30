import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AdminStatsService, withParams } from './admin-stats.service';
import { UserRole } from '../users/entities/user.entity';

/**
 * El SQL se verifica contra una base real (no tiene sentido mockear
 * Postgres para probar un GROUP BY). Acá se blindan las reglas que no
 * dependen de la base: el alcance según el rol y el armado de parámetros.
 */
describe('AdminStatsService', () => {
  let query: jest.Mock;
  let service: AdminStatsService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    service = new AdminStatsService(
      { query } as unknown as DataSource,
      { get: () => 'America/Argentina/Buenos_Aires' } as unknown as ConfigService,
    );
  });

  it('el admin consulta toda la plataforma (sin id de docente)', async () => {
    const stats = await service.getStats({ id: 'admin-1', role: UserRole.ADMIN }, 30);

    expect(stats.scope).toBe('platform');
    for (const [, params] of query.mock.calls) {
      expect(params).toEqual(['America/Argentina/Buenos_Aires', 30, null]);
    }
  });

  it('el docente consulta sólo lo suyo y no ve números de la plataforma', async () => {
    const stats = await service.getStats({ id: 'teacher-1', role: UserRole.TEACHER }, 7);

    expect(stats.scope).toBe('teacher');
    for (const [, params] of query.mock.calls) {
      expect(params[2]).toBe('teacher-1');
    }
    expect(stats.totals.users).toBeNull();
    expect(stats.totals.teachers).toBeNull();
    expect(stats.totals.categories).toBeNull();
    expect(stats.totals.activeSubscriptions).toBeNull();
  });

  it('sin reseñas el promedio es null, no 0', async () => {
    const stats = await service.getStats({ id: 'admin-1', role: UserRole.ADMIN }, 30);
    expect(stats.totals.averageRating).toBeNull();
  });
});

describe('withParams', () => {
  it('declara los tres parámetros también en consultas que no los usan', () => {
    const sql = withParams('SELECT 1');
    expect(sql).toContain('$1::text');
    expect(sql).toContain('$2::int');
    expect(sql).toContain('$3::uuid');
    expect(sql.endsWith('SELECT 1')).toBe(true);
  });

  it('se suma a un WITH existente en vez de anidar otro', () => {
    const sql = withParams('WITH days AS (SELECT 1) SELECT * FROM days');
    expect(sql.match(/\bWITH\b/g)).toHaveLength(1);
    expect(sql).toContain('_params AS');
    expect(sql).toContain(', days AS (SELECT 1)');
  });
});
