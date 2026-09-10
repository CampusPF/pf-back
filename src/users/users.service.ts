import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { normalizeEmail } from '../common/utils/normalize-email.util';

/** Lo que ve el usuario de sí mismo en GET /users/me. Nunca incluye el hash. */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  birthDate: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  /** false = cuenta creada con Google que todavía no seteó contraseña. */
  hasPassword: boolean;
  isGoogleAccount: boolean;
}

/**
 * Costo de bcrypt. 12 es el mínimo razonable hoy: cada +1 duplica el tiempo
 * de cómputo, lo que encarece un ataque de diccionario sobre la base filtrada.
 * No bajarlo por "performance del login": son milisegundos una vez por login.
 */
const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) { }

  async create(dto: CreateUserDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = this.usersRepository.create({
      name: dto.name,
      // Defensivo: también normalizamos cuando el service se llama directamente.
      email: normalizeEmail(dto.email),
      passwordHash,
      role: dto.role ?? UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      // Los datos personales del formulario de registro. Hasta ahora este
      // método sólo guardaba name/email/password, así que todo lo que el
      // usuario completaba acá se perdía y quedaba en null en la base.
      birthDate: dto.birthDate,
      phone: dto.phone,
      address: dto.address,
      city: dto.city,
      country: dto.country,
    });

    return this.usersRepository.save(user);
  }

  async findById(id: string) {
    return this.usersRepository.findOne({
      where: { id },
    });
  }

  async findAll(includeDeleted = false): Promise<User[]> {
    return this.usersRepository.find({
      where: includeDeleted ? {} : { status: Not(UserStatus.DELETED) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }

    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    // Único lugar que pide passwordHash explícitamente.
    return this.usersRepository.findOne({
      where: { email: normalizeEmail(email) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
        googleId: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    Object.assign(user, dto);

    return this.usersRepository.save(user);
  }

  /* ── Perfil propio (GET/PATCH /users/me) ──────────────────────────── */

  /**
   * Ficha completa del usuario para su propia pantalla de configuración.
   *
   * Distinto de findOne(), que devuelve la vista mínima que se usa en
   * listados y en la validación del JWT. Acá sí van los datos personales.
   *
   * Devuelve un objeto plano armado a mano, no la entidad: así el shape es
   * explícito y `passwordHash` no puede escaparse por accidente aunque se lo
   * pida en el select (que hace falta para derivar `hasPassword`).
   */
  async findProfile(id: string): Promise<UserProfile> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        birthDate: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        googleId: true,
        // select:false en la entidad; pedirlo explícitamente lo trae.
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      birthDate: user.birthDate ?? null,
      phone: user.phone ?? null,
      address: user.address ?? null,
      city: user.city ?? null,
      country: user.country ?? null,
      // El front necesita los dos para decidir qué formulario de contraseña
      // mostrar: sin contraseña se ofrece crear una (sin pedir la actual).
      hasPassword: user.passwordHash !== null && user.passwordHash !== undefined,
      isGoogleAccount: user.googleId !== null && user.googleId !== undefined,
    };
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserProfile> {
    // Falla con 404 antes de escribir si el id no existe.
    await this.findProfile(id);

    // update() en vez de save(): sólo toca las columnas del dto y no arrastra
    // una entidad parcial (findProfile no carga todas las columnas).
    await this.usersRepository.update({ id }, dto);

    return this.findProfile(id);
  }

  /**
   * Cambia la contraseña, o crea la primera si la cuenta se dio de alta con
   * Google. Ver SetPasswordDto para el porqué de los dos caminos.
   */
  async setPassword(id: string, dto: SetPasswordDto): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }

    const hadPassword = user.passwordHash !== null && user.passwordHash !== undefined;

    if (hadPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Ingresá tu contraseña actual.');
      }

      const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash!);
      if (!matches) {
        throw new UnauthorizedException('La contraseña actual no es correcta.');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.update({ id }, { passwordHash });

    return {
      message: hadPassword
        ? 'Contraseña actualizada.'
        : 'Contraseña creada. Ahora también podés entrar con tu email y contraseña.',
    };
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);

    user.status = UserStatus.DELETED;

    return this.usersRepository.save(user);
  }

  async restore(id: string): Promise<User> {
    const user = await this.findOne(id);

    user.status = UserStatus.ACTIVE;

    return this.usersRepository.save(user);
  }
}