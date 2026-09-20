import { CourseStatsService } from './course-stats.service';

/**
 * Tests de CourseStatsService sin Nest DI ni base: cada repositorio es un
 * QueryBuilder falso que devuelve las filas agrupadas que devolvería Postgres
 * (AVG, COUNT y SUM llegan como string). Lo que se valida es cómo se mezclan
 * en cada curso, no el SQL.
 */
function fakeRepo(rows: unknown[]) {
    const builder: Record<string, unknown> = {};
    for (const method of [
        'select',
        'addSelect',
        'innerJoin',
        'where',
        'andWhere',
        'groupBy',
    ]) {
        builder[method] = jest.fn(() => builder);
    }
    builder.getRawMany = jest.fn(async () => rows);
    return { createQueryBuilder: jest.fn(() => builder), builder };
}

function makeService(opts: {
    reviews?: unknown[];
    enrollments?: unknown[];
    lessons?: unknown[];
}) {
    const reviews = fakeRepo(opts.reviews ?? []);
    const enrollments = fakeRepo(opts.enrollments ?? []);
    const lessons = fakeRepo(opts.lessons ?? []);

    const service = new CourseStatsService(
        reviews as any,
        enrollments as any,
        lessons as any,
    );
    return { service, lessons };
}

describe('CourseStatsService', () => {
    it('sin cursos → no consulta nada', async () => {
        const { service, lessons } = makeService({});

        const stats = await service.getStats([]);

        expect(stats.size).toBe(0);
        expect(lessons.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('agrega lessonsCount y totalDurationMinutes (llegan como string) a cada curso', async () => {
        const { service } = makeService({
            lessons: [
                { courseId: 'c1', count: '24', minutes: '720' },
                { courseId: 'c2', count: '6', minutes: '90' },
            ],
        });

        const stats = await service.getStats(['c1', 'c2']);

        expect(stats.get('c1')).toMatchObject({ lessonsCount: 24, totalDurationMinutes: 720 });
        expect(stats.get('c2')).toMatchObject({ lessonsCount: 6, totalDurationMinutes: 90 });
    });

    it('curso sin lecciones → 0 y 0 (no undefined ni null)', async () => {
        const { service } = makeService({
            lessons: [{ courseId: 'c1', count: '3', minutes: '45' }],
        });

        const stats = await service.getStats(['c1', 'c-vacio']);

        expect(stats.get('c-vacio')).toEqual({
            ratingAverage: null,
            reviewsCount: 0,
            studentsCount: 0,
            lessonsCount: 0,
            totalDurationMinutes: 0,
        });
    });

    it('lecciones cargadas pero sin minutos → lessonsCount > 0 y minutos en 0', async () => {
        const { service } = makeService({
            lessons: [{ courseId: 'c1', count: '6', minutes: '0' }],
        });

        const stats = await service.getStats(['c1']);

        expect(stats.get('c1')).toMatchObject({ lessonsCount: 6, totalDurationMinutes: 0 });
    });

    it('cuenta sólo lecciones y módulos vivos', async () => {
        const { service, lessons } = makeService({});

        await service.getStats(['c1']);

        const andWhere = lessons.builder.andWhere as jest.Mock;
        expect(andWhere).toHaveBeenCalledWith('lesson.isActive = true');
        expect(andWhere).toHaveBeenCalledWith('module.isActive = true');
    });

    it('withStats mezcla las stats en cada curso sin perder sus campos', async () => {
        const { service } = makeService({
            enrollments: [{ courseId: 'c1', count: '12' }],
            lessons: [{ courseId: 'c1', count: '24', minutes: '720' }],
        });

        const result = await service.withStats([{ id: 'c1', title: 'React' }]);

        expect(result[0]).toMatchObject({
            id: 'c1',
            title: 'React',
            studentsCount: 12,
            lessonsCount: 24,
            totalDurationMinutes: 720,
        });
    });
});
