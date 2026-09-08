import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { normalizeEmail } from '../../common/utils/normalize-email.util';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(config: ConfigService) {
        super({
            clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
            clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
    ): Promise<void> {
        const { id, name, emails, photos } = profile;

        const googleUser = {
            googleId: id,
            // Este objeto NO pasa por ningún DTO/ValidationPipe (no es un
            // request HTTP normal), así que la normalización tiene que
            // pasar acá — es el único punto de entrada de este flujo.
            email: normalizeEmail(emails?.[0]?.value ?? ''),
            name: `${name?.givenName ?? ''} ${name?.familyName ?? ''}`.trim(),
            avatarUrl: photos?.[0]?.value,
        };

        // Este objeto queda disponible como request.user dentro del controller
        done(null, googleUser);
    }
}