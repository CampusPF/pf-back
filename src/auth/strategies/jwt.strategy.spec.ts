import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { UserRole, UserStatus } from '../../users/entities/user.entity';

/**
 * Esta es la pieza más importante del fix: se corre en TODO request
 * autenticado (no sólo al loguearse), así que es lo único que corta el
 * acceso de una cuenta dada de baja cuyo JWT ya estaba emitido — el mismo
 * token con el que alguien pudo entrar diez minutos antes de que un admin
 * lo elimine.
 */
describe('JwtStrategy', () => {
  const PAYLOAD = { sub: 'user-1', email: 'ana@test.com', role: 'student' };

  const makeStrategy = (findOne: jest.Mock) =>
    new JwtStrategy(
      { getOrThrow: () => 'test-secret' } as any,
      { findOne } as unknown as UsersService,
    );

  it('usuario activo: pasa y devuelve id/email/role', async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'ana@test.com',
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
    });

    await expect(makeStrategy(findOne).validate(PAYLOAD)).resolves.toEqual({
      id: 'user-1',
      email: 'ana@test.com',
      role: UserRole.STUDENT,
    });
  });

  it.each([UserStatus.DELETED, UserStatus.BANNED, UserStatus.INACTIVE])(
    'usuario con status %s: rechaza aunque el JWT sea válido',
    async (status) => {
      const findOne = jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        role: UserRole.STUDENT,
        status,
      });

      await expect(makeStrategy(findOne).validate(PAYLOAD)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );
});
