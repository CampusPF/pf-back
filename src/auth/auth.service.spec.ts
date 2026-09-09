import { JwtService } from '@nestjs/jwt';
import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';

// Nota: NO se usa @nestjs/testing acá a propósito. La versión instalada
// (v12.0.1) se distribuye como paquete ESM puro ("type": "module", sin
// build CommonJS), incompatible con la configuración actual de Jest/ts-jest
// de este proyecto (CommonJS) — es un problema de infraestructura del repo,
// preexistente y más grande que este cambio, no algo para resolver acá.
//
// No hace falta el contenedor de DI de Nest para este test: AuthService y
// UsersService son clases con dependencias inyectadas por constructor, así
// que se instancian a mano con los fakes/mocks de abajo.

/**
 * Construye un QueryFailedError REAL (no un mock) con el código de Postgres
 * de unique_violation, para ejercitar tal cual la rama de recuperación de
 * carrera de AuthService (que hace `error instanceof QueryFailedError` y
 * mira `error.code`), no una simulación aproximada.
 */
function makeUniqueViolation(): QueryFailedError {
  const driverError: any = new Error(
    'duplicate key value violates unique constraint',
  );
  driverError.code = '23505';
  return new QueryFailedError('INSERT INTO "users" (...)', [], driverError);
}

/** Cede el control al event loop, como lo haría una llamada de red real a Postgres. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Repositorio en memoria que imita lo mínimo necesario de Postgres para
 * estos tests: unique constraint sobre email y sobre googleId.
 *
 * El `await tick()` al principio de findOne/save es lo que hace posible
 * reproducir una carrera real en el test: sin eso, dos llamadas a
 * loginWithGoogle() en un mismo Promise.all nunca se solaparían (el motor
 * de JS correría cada una de punta a punta antes de tocar la otra), y el
 * test de concurrencia no probaría nada.
 */
class FakeUsersRepository {
  private rows: Partial<User>[] = [];
  private seq = 0;

  create(partial: Partial<User>): Partial<User> {
    return { ...partial };
  }

  async save(entity: Partial<User>): Promise<User> {
    await tick();

    const isUpdate = !!entity.id && this.rows.some((r) => r.id === entity.id);
    const conflicts = (excludeId?: string) =>
      this.rows.some(
        (r) =>
          r.id !== excludeId &&
          ((entity.email !== undefined && r.email === entity.email) ||
            (entity.googleId != null && r.googleId === entity.googleId)),
      );

    if (!isUpdate) {
      if (conflicts()) throw makeUniqueViolation();
      const saved: Partial<User> = {
        ...entity,
        id: entity.id ?? `fake-id-${++this.seq}`,
        role: entity.role ?? UserRole.STUDENT,
        status: entity.status ?? UserStatus.ACTIVE,
        createdAt: entity.createdAt ?? new Date(),
        updatedAt: entity.updatedAt ?? new Date(),
      };
      this.rows.push(saved);
      return saved as User;
    }

    if (conflicts(entity.id)) throw makeUniqueViolation();
    const idx = this.rows.findIndex((r) => r.id === entity.id);
    this.rows[idx] = { ...this.rows[idx], ...entity };
    return this.rows[idx] as User;
  }

  async findOne(options: {
    where: Record<string, any> | Record<string, any>[];
  }): Promise<User | null> {
    await tick();

    const matches = (row: Partial<User>, clause: Record<string, any>) =>
      Object.entries(clause).every(([key, value]) => (row as any)[key] === value);

    const clauses = Array.isArray(options.where) ? options.where : [options.where];
    const found = this.rows.find((row) => clauses.some((clause) => matches(row, clause)));
    return (found as User) ?? null;
  }

  async find(): Promise<User[]> {
    await tick();
    return this.rows as User[];
  }
}

// Payload mínimo válido para RegisterDto/LoginDto. Se castea con `as any`
// porque acá se llama a AuthService directo, sin pasar por el
// ValidationPipe — justamente lo que confirma que la normalización de
// email funciona a nivel de SERVICE (UsersService/AuthService), no sólo
// como azúcar de DTO (@Transform), que es la garantía real que importa.
function registerPayload(overrides: { name: string; email: string }) {
  return {
    ...overrides,
    password: 'SecurePass123',
    confirmPassword: 'SecurePass123',
    birthDate: '1995-01-01',
    phone: '+541112345678',
  };
}

describe('AuthService — matching de usuario (form vs Google)', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  beforeEach(() => {
    const fakeRepo = new FakeUsersRepository();

    // UsersService solo depende del repositorio de User.
    usersService = new UsersService(fakeRepo as any);

    // JwtService real de @nestjs/jwt no hace falta: lo único que AuthService
    // usa de él es `.sign(payload)`, así que un mock alcanza y sigue siendo
    // real la lógica de negocio que nos importa testear (quién es "el mismo
    // usuario"), no la firma criptográfica del JWT en sí.
    jwtService = {
      sign: jest.fn((payload: { sub: string }) => `fake.jwt.${payload.sub}`),
    } as unknown as JwtService;

    // AuthService también recibe el repositorio de User directo (lo usa en
    // loginWithGoogle), además de UsersService y JwtService.
    authService = new AuthService(usersService, jwtService, fakeRepo as any);
  });

  it('registro con email en mayúsculas + login con el mismo email en minúsculas → mismo user.id', async () => {
    const registered = await authService.register(
      registerPayload({ name: 'Ana Test', email: 'Usuario@Gmail.com' }) as any,
    );

    const loggedIn = await authService.login({
      email: 'usuario@gmail.com',
      password: 'SecurePass123',
    } as any);

    expect(loggedIn.user.id).toBe(registered.user.id);
  });

  it('registro por form + login por Google con el mismo email → se vincula al MISMO usuario y setea googleId', async () => {
    const registered = await authService.register(
      registerPayload({ name: 'Bruno Test', email: 'Bruno@Test.com' }) as any,
    );

    const viaGoogle = await authService.loginWithGoogle({
      googleId: 'google-id-bruno',
      email: 'bruno@test.com', // distinto casing, mismo email real
      name: 'Bruno Test',
    });

    expect(viaGoogle.user.id).toBe(registered.user.id);

    const linked = await usersService.findByEmail('bruno@test.com');
    expect(linked?.googleId).toBe('google-id-bruno');
  });

  it('login por Google sin cuenta previa → rechaza, NO crea usuario', async () => {
    await expect(
      authService.loginWithGoogle({
        googleId: 'google-id-carla',
        email: 'carla@test.com',
        name: 'Carla Test',
      }),
    ).rejects.toThrow('No existe una cuenta con este email');

    const all = await usersService.findAll();
    expect(all.filter((u) => u.email === 'carla@test.com')).toHaveLength(0);
  });

  it('dos requests concurrentes al vincular Google (cuenta ya registrada por form) → un solo usuario, ningún 500', async () => {
    const registered = await authService.register(
      registerPayload({ name: 'Race Test', email: 'race@test.com' }) as any,
    );

    const googleUser = { googleId: 'google-id-race', email: 'race@test.com', name: 'Race Test' };

    // Si la recuperación de carrera no funcionara, uno de los dos rechazaría
    // con el QueryFailedError sin manejar (lo que en el controller se
    // traduciría en un 500).
    const [r1, r2] = await Promise.all([
      authService.loginWithGoogle(googleUser),
      authService.loginWithGoogle(googleUser),
    ]);

    expect(r1.user.id).toBe(registered.user.id);
    expect(r2.user.id).toBe(registered.user.id);

    const all = await usersService.findAll();
    expect(all.filter((u) => u.email === 'race@test.com')).toHaveLength(1);
  });

  it('el JWT de register/login/loginWithGoogle para el mismo user.id firma siempre el mismo `sub`', async () => {
    const registered = await authService.register(
      registerPayload({ name: 'Dana Test', email: 'dana@test.com' }) as any,
    );

    const loggedIn = await authService.login({
      email: 'dana@test.com',
      password: 'SecurePass123',
    } as any);

    const viaGoogle = await authService.loginWithGoogle({
      googleId: 'google-id-dana',
      email: 'dana@test.com',
      name: 'Dana Test',
    });

    const signedSubs = (jwtService.sign as jest.Mock).mock.calls.map(
      (call) => call[0].sub,
    );

    expect(new Set(signedSubs).size).toBe(1);
    expect(signedSubs[0]).toBe(registered.user.id);
    expect(loggedIn.user.id).toBe(registered.user.id);
    expect(viaGoogle.user.id).toBe(registered.user.id);
  });

  // Bonus: mismo tipo de carrera que en loginWithGoogle, pero en el flujo de
  // registro por formulario (agregado junto con el fix, no pedido
  // explícitamente en la consigna original, pero es el mismo bug en el
  // hermano del flujo).
  it('dos registros concurrentes con el mismo email → uno 201, el otro ConflictException (no 500)', async () => {
    const payload = registerPayload({ name: 'Race Form', email: 'raceform@test.com' });

    const results = await Promise.allSettled([
      authService.register(payload as any),
      authService.register(payload as any),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      'El email ya está registrado',
    );

    const all = await usersService.findAll();
    expect(all.filter((u) => u.email === 'raceform@test.com')).toHaveLength(1);
  });
});
