import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ResetTokenService } from './reset-token.service';

/**
 * De esto depende que un link de recuperación no se pueda reusar ni fabricar,
 * así que se testea la lógica propia: la huella, el chequeo de `purpose` y el
 * uso del secret separado. Lo que es responsabilidad de jsonwebtoken (firma,
 * expiración) no se re-testea acá.
 */
describe('ResetTokenService', () => {
    const RESET_SECRET = 'secret-de-reseteo-para-tests-0123456789';
    const SESSION_SECRET = 'secret-de-sesion-para-tests-9876543210';
    const HASH_A = '$2b$12$hashDeEjemploParaElUsuarioA';
    const HASH_B = '$2b$12$hashDistintoTrasCambiarLaPass';

    let service: ResetTokenService;
    let jwtService: JwtService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [JwtModule.register({})],
            providers: [
                ResetTokenService,
                {
                    provide: ConfigService,
                    useValue: {
                        getOrThrow: (key: string) => {
                            if (key === 'JWT_RESET_SECRET') return RESET_SECRET;
                            throw new Error(`Config no esperada en el test: ${key}`);
                        },
                    },
                },
            ],
        }).compile();

        service = module.get(ResetTokenService);
        jwtService = module.get(JwtService);
    });

    it('un token recién emitido verifica y devuelve el usuario', () => {
        const token = service.generate('user-1', HASH_A);

        const { userId, fp } = service.verify(token);

        expect(userId).toBe('user-1');
        expect(service.matchesCurrentPassword(fp, HASH_A)).toBe(true);
    });

    /* El corazón del "un solo uso": cambiar la contraseña cambia el hash, y
       la huella del token viejo deja de coincidir. */
    it('deja de coincidir cuando la contraseña ya cambió', () => {
        const { fp } = service.verify(service.generate('user-1', HASH_A));

        expect(service.matchesCurrentPassword(fp, HASH_B)).toBe(false);
    });

    it('no expone el hash de la contraseña en el token', () => {
        const token = service.generate('user-1', HASH_A);
        const payload = jwtService.decode(token) as { fp: string };

        expect(payload.fp).not.toContain(HASH_A);
        expect(HASH_A).not.toContain(payload.fp);
    });

    // Una cuenta creada con Google no tiene contraseña todavía: el flujo tiene
    // que servirle igual para crearse la primera.
    it('funciona con una cuenta sin contraseña (null)', () => {
        const { fp } = service.verify(service.generate('user-google', null));

        expect(service.matchesCurrentPassword(fp, null)).toBe(true);
        // Y una vez que se crea una, el token queda inválido igual que siempre.
        expect(service.matchesCurrentPassword(fp, HASH_A)).toBe(false);
    });

    it('rechaza un token firmado con el secret de sesión', () => {
        const ajeno = jwtService.sign(
            { sub: 'user-1', purpose: 'password_reset', fp: 'loquesea' },
            { secret: SESSION_SECRET },
        );

        expect(() => service.verify(ajeno)).toThrow(BadRequestException);
    });

    /* Segunda barrera: aunque alguien logre firmar con el secret correcto, un
       token que no sea de reseteo no sirve para resetear. */
    it('rechaza un token con el secret correcto pero otro purpose', () => {
        const otroProposito = jwtService.sign(
            { sub: 'user-1', purpose: 'login', fp: 'loquesea' },
            { secret: RESET_SECRET },
        );

        expect(() => service.verify(otroProposito)).toThrow('Token inválido.');
    });

    it('rechaza cualquier cosa que no sea un JWT', () => {
        expect(() => service.verify('no-es-un-token')).toThrow(BadRequestException);
    });
});
