import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      // Defensivo: dto.email ya viene normalizado por el @Transform del DTO
      // cuando entra por HTTP, pero este service también se llama directo
      // (AuthService.register, seeders) sin pasar por el ValidationPipe.
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


  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
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
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    // Único lugar que pide passwordHash explícitamente (la columna es
    // select:false en la entidad): el login lo necesita para el bcrypt.compare.
    // El objeto que devuelve NO debe salir tal cual en una respuesta HTTP.
    //
    // Normaliza el argumento acá también (no solo en los DTOs): así, sin
    // importar quién llame a este método, "Usuario@Gmail.com" siempre
    // encuentra la misma fila que "usuario@gmail.com".
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

  async remove(id: string): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Usuario ${id} no encontrado`);
  }
}