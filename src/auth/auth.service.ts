import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { normalizeEmail } from '../common/utils/normalize-email.util';

/** Código de Postgres para "unique_violation". */
const POSTGRES_UNIQUE_VIOLATION = '23505';

interface GoogleUserPayload {
    googleId: string;
    email: string;
    name: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
    ) { }

    async register(dto: RegisterDto) {
        const existing = await this.usersService.findByEmail(dto.email);
        if (existing) throw new ConflictException('El email ya está registrado');

        try {
            const user = await this.usersService.create({
                name: dto.name,
                email: dto.email,
                password: dto.password, // ya no se hashea acá, lo hace UsersService
            });

            return this.buildToken(user);
        } catch (error) {
            // Misma carrera que en loginWithGoogle: dos registros simultáneos
            // con el mismo email pueden pasar el check de arriba y chocar acá
            // contra el unique constraint. Lo traducimos a un 409 esperable,
            // no a un 500.
            if (
                error instanceof QueryFailedError &&
                (error as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
            ) {
                throw new ConflictException('El email ya está registrado');
            }
            throw error;
        }
    }

    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) throw new UnauthorizedException('Credenciales inválidas');

        if (!user.passwordHash) {
            throw new UnauthorizedException(
                'Esta cuenta inicia sesión con Google. Usá el botón "Continuar con Google".',
            );
        }

        const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
        if (!passwordMatches) throw new UnauthorizedException('Credenciales inválidas');

        return this.buildToken(user);
    }

    async loginWithGoogle(googleUser: GoogleUserPayload) {
        // Defensivo: GoogleStrategy ya normaliza, pero este método también se
        // podría llamar desde otro lado en el futuro sin pasar por ahí.
        const email = normalizeEmail(googleUser.email);
        const findExisting = () =>
            this.usersRepository.findOne({
                where: [{ googleId: googleUser.googleId }, { email }],
            });

        let user = await findExisting();

        if (!user) {
            // Google NO registra usuarios nuevos: solo sirve para entrar o
            // enlazar cuentas que ya existen (creadas por el formulario de
            // registro). Si no hay ninguna cuenta con este email/googleId,
            // se rechaza el acceso.
            throw new UnauthorizedException(
                'No existe una cuenta con este email. Primero registrate en la plataforma.',
            );
        } else if (!user.googleId) {
            // Ya existía con email/password normal: vinculamos la cuenta de
            // Google. Misma carrera posible si el usuario dispara dos
            // requests casi simultáneos vinculando la cuenta por primera vez.
            user.googleId = googleUser.googleId;
            try {
                user = await this.usersRepository.save(user);
            } catch (error) {
                user = await this.recoverFromRaceOrRethrow(error, findExisting);
            }
        }

        return this.buildToken(user);
    }

    /**
     * Ante un choque de unique constraint (23505), asumimos que fue una
     * carrera contra un request gemelo que ganó, y devolvemos ESE usuario en
     * vez de un 500. Cualquier otro error se re-lanza tal cual: no queremos
     * ocultar un error real detrás de "debe haber sido una carrera".
     */
    private async recoverFromRaceOrRethrow(
        error: unknown,
        findExisting: () => Promise<User | null>,
    ): Promise<User> {
        const isUniqueViolation =
            error instanceof QueryFailedError &&
            (error as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;

        if (!isUniqueViolation) throw error;

        const existing = await findExisting();
        if (!existing) throw error; // no debería pasar; no ocultamos el error si pasa

        return existing;
    }

    private buildToken(user: { id: string; email: string; role: string }) {
        const payload = { sub: user.id, email: user.email, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
            user: { id: user.id, email: user.email, role: user.role },
        };
    }
}