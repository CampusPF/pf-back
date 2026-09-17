import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserActivityService } from './user-activity.service';
import { UserActivity } from './entities/user-activity.entity';

/**
 * La racha es aritmética de fechas, que es donde se cuelan los errores off-by-one
 * y los saltos de huso horario. Se testea contra un repositorio mockeado: no
 * hace falta base para verificar la regla.
 */
describe('UserActivityService', () => {
  let service: UserActivityService;
  let find: jest.Mock;
  let execute: jest.Mock;
  let values: jest.Mock;

  /** 'YYYY-MM-DD' de hoy en UTC, desplazado n días hacia atrás. */
  const daysAgo = (n: number): string => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  /** Lo que devolvería el repo: los días, del más nuevo al más viejo. */
  const givenDays = (offsets: number[]) =>
    find.mockResolvedValue(offsets.map((n) => ({ date: daysAgo(n) })));

  beforeEach(async () => {
    find = jest.fn();
    execute = jest.fn().mockResolvedValue(undefined);
    values = jest.fn().mockReturnValue({ orIgnore: () => ({ execute }) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserActivityService,
        {
          provide: getRepositoryToken(UserActivity),
          useValue: {
            find,
            createQueryBuilder: () => ({
              insert: () => ({ into: () => ({ values }) }),
            }),
          },
        },
      ],
    }).compile();

    service = module.get(UserActivityService);
  });

  describe('getCurrentStreak', () => {
    it('devuelve 0 si el usuario nunca tuvo actividad', async () => {
      givenDays([]);
      await expect(service.getCurrentStreak('u1')).resolves.toBe(0);
    });

    it('cuenta 1 si solo estudió hoy', async () => {
      givenDays([0]);
      await expect(service.getCurrentStreak('u1')).resolves.toBe(1);
    });

    it('cuenta los días consecutivos hasta hoy', async () => {
      givenDays([0, 1, 2, 3]);
      await expect(service.getCurrentStreak('u1')).resolves.toBe(4);
    });

    // Si la racha exigiera actividad HOY, todo el mundo vería 0 al abrir la
    // app a la mañana, aunque venga de veinte días seguidos.
    it('sigue viva si la última actividad fue ayer', async () => {
      givenDays([1, 2, 3]);
      await expect(service.getCurrentStreak('u1')).resolves.toBe(3);
    });

    it('se corta si la última actividad fue anteayer', async () => {
      givenDays([2, 3, 4]);
      await expect(service.getCurrentStreak('u1')).resolves.toBe(0);
    });

    it('corta en el primer hueco y no cuenta lo anterior', async () => {
      // hoy, ayer, (falta anteayer), y tres días viejos que ya no suman
      givenDays([0, 1, 5, 6, 7]);
      await expect(service.getCurrentStreak('u1')).resolves.toBe(2);
    });

    it('no cuenta dos veces un día duplicado', async () => {
      givenDays([0, 0, 1]);
      await expect(service.getCurrentStreak('u1')).resolves.toBe(2);
    });
  });

  describe('registerActivityToday', () => {
    it('inserta el día de hoy ignorando el duplicado', async () => {
      await service.registerActivityToday('u1');

      expect(values).toHaveBeenCalledWith({ userId: 'u1', date: daysAgo(0) });
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });
});
