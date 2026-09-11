import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { normalizeEmail } from '../common/utils/normalize-email.util';

/** Código de Postgres para "unique_violation". */
const POSTGRES_UNIQUE_VIOLATION = '23505';

interface GoogleUserPayload {
    googleId: string;
    email: string;
    name: string;
    /** Foto de la cuenta de Google. Opcional: el perfil puede no tenerla. */
    avatarUrl?: string;
}

/**
 * Desde qué pantalla del front arrancó el login social. Lo manda el front
 * como `?flow=` y viaja por el `state` de OAuth (ver GoogleAuthGuard).
 *   - 'login': "Continuar con Google" en /login. NO crea cuentas.
 *   - 'register': "Continuar con Google" en /register. Crea la cuenta si el
 *     email no existe; si ya existe, rebota (hay que iniciar sesión).
 */
export type GoogleAuthFlow = 'login' | 'register';

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
                // Los datos personales que el formulario de registro pide como
                // obligatorios. Antes este llamado pasaba sólo los tres campos
                // de arriba, así que birthDate/phone/address/city/country se
                // perdían en el camino y quedaban en null para todo el mundo.
                birthDate: dto.birthDate,
                phone: dto.phone,
                address: dto.address,
                city: dto.city,
                country: dto.country,
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

    async loginWithGoogle(
        googleUser: GoogleUserPayload,
        flow: GoogleAuthFlow = 'login',
    ) {
        // Defensivo: GoogleStrategy ya normaliza, pero este método también se
        // podría llamar desde otro lado en el futuro sin pasar por ahí.
        const email = normalizeEmail(googleUser.email);
        const findExisting = () =>
            this.usersRepository.findOne({
                where: [{ googleId: googleUser.googleId }, { email }],
            });

        let user = await findExisting();

        if (flow === 'register') {
            // "Continuar con Google" desde /register.
            if (user) {
                // Ya hay una cuenta con este email (con o sin Google
                // vinculado): no se registra de nuevo, se lo manda al login.
                throw new ConflictException(
                    'Ya existe una cuenta con este email. Iniciá sesión.',
                );
            }
            user = await this.createGoogleUser(googleUser, email, findExisting);
            return this.buildToken(user);
        }

        // flow === 'login': "Continuar con Google" desde /login.
        if (!user) {
            // Desde el login NO se crean cuentas: se lo manda a registrarse.
            throw new UnauthorizedException(
                'No existe una cuenta con este email. Registrate primero.',
            );
        }

        if (!user.googleId) {
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
     * Alta de una cuenta nueva a partir del perfil de Google (registro
     * social). Google nos da nombre, email y foto: birthDate, phone y country
     * quedan en null y se completan después desde el perfil. La cuenta no
     * tiene passwordHash — sólo se entra con Google hasta que setee una.
     *
     * La foto se guarda como avatarUrl pero SIN avatarPublicId: el archivo es
     * de Google, no nuestro, así que no hay nada que borrar si después el
     * usuario sube su propio avatar.
     */
    private async createGoogleUser(
        googleUser: GoogleUserPayload,
        email: string,
        findExisting: () => Promise<User | null>,
    ): Promise<User> {
        try {
            const created = this.usersRepository.create({
                name: googleUser.name?.trim() || email.split('@')[0],
                email,
                googleId: googleUser.googleId,
                avatarUrl: googleUser.avatarUrl,
                passwordHash: null,
                role: UserRole.STUDENT,
                status: UserStatus.ACTIVE,
            });
            return await this.usersRepository.save(created);
        } catch (error) {
            // Carrera: otro request creó la cuenta entre el findExisting y
            // este save. Devolvemos esa en vez de un 500.
            return this.recoverFromRaceOrRethrow(error, findExisting);
        }
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

    private buildToken(user: { id: string; name: string; email: string; role: string }) {
        const payload = { sub: user.id, email: user.email, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
            // `name` va en la respuesta (no en el payload del JWT, que se
            // mantiene mínimo a propósito): el front lo cachea al iniciar
            // sesión y lo muestra en el saludo del dashboard sin tener que
            // esperar a un GET /users/me. Los tres llamadores ya tienen el
            // `name` cargado (create() y findByEmail() lo traen).
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        };
    }
}