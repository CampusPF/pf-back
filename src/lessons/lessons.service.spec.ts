import { NotFoundException } from '@nestjs/common';
import { LessonsService } from './lessons.service';

/**
 * Sin DB: se mockea el repositorio. Lo que importa validar acá:
 *  - findOne pide explícitamente content/videoUrl (addSelect) + module.course
 *  - findAll / findAllByModule NO los piden (van por find(), y las columnas
 *    son select:false en la entidad)
 */

function makeQueryBuilderMock(result: unknown) {
    const qb: any = {};
    qb.leftJoinAndSelect = jest.fn(() => qb);
    qb.addSelect = jest.fn(() => qb);
    qb.where = jest.fn(() => qb);
    qb.getOne = jest.fn(async () => result);
    return qb;
}

function makeService(qbResult: unknown = null) {
    const qb = makeQueryBuilderMock(qbResult);
    const lessonsRepository = {
        createQueryBuilder: jest.fn(() => qb),
        find: jest.fn((_opts?: Record<string, any>) => Promise.resolve([] as unknown[])),
    };
    const courseModulesRepository = { findOne: jest.fn() };

    const service = new LessonsService(
        lessonsRepository as any,
        courseModulesRepository as any,
    );

    return { service, lessonsRepository, qb };
}

describe('LessonsService.findOne', () => {
    it('trae content/videoUrl con addSelect y joinea module.course', async () => {
        const lesson = { id: 'l1', module: { course: { id: 'c1', priceInCents: 0 } } };
        const { service, qb } = makeService(lesson);

        await expect(service.findOne('l1')).resolves.toBe(lesson);

        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('lesson.module', 'module');
        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('module.course', 'course');
        expect(qb.addSelect).toHaveBeenCalledWith(['lesson.content', 'lesson.videoUrl']);
    });

    it('lección inexistente → 404', async () => {
        const { service } = makeService(null);
        await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('LessonsService listados (no filtran por acceso, pero nunca traen contenido)', () => {
    it('findAll usa find() sin addSelect de content/videoUrl', async () => {
        const { service, lessonsRepository, qb } = makeService();

        await service.findAll();

        expect(lessonsRepository.find).toHaveBeenCalledTimes(1);
        // el contenido solo sale por el QueryBuilder de findOne
        expect(qb.addSelect).not.toHaveBeenCalled();
        const options = (lessonsRepository.find.mock.calls[0]?.[0] ?? {}) as Record<string, any>;
        expect('select' in options).toBe(false);
        expect(JSON.stringify(options)).not.toMatch(/content|videoUrl/);
    });

    it('findAllByModule usa find() y filtra isActive por defecto', async () => {
        const { service, lessonsRepository } = makeService();

        await service.findAllByModule('mod-1');

        const options = (lessonsRepository.find.mock.calls[0]?.[0] ?? {}) as Record<string, any>;
        expect(options.where).toEqual({ module: { id: 'mod-1' }, isActive: true });
        expect(JSON.stringify(options)).not.toMatch(/content|videoUrl/);
    });
});
