import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { normalizeEmail } from '../common/utils/normalize-email.util';

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