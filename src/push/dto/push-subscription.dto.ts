import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MinLength, ValidateNested } from 'class-validator';

class PushKeysDto {
    @IsString()
    @MinLength(1)
    p256dh: string;

    @IsString()
    @MinLength(1)
    auth: string;
}

export class SubscribePushDto {
    @IsUrl({ require_tld: false })
    endpoint: string;

    @ValidateNested()
    @Type(() => PushKeysDto)
    keys: PushKeysDto;
}

export class UnsubscribePushDto {
    @IsUrl({ require_tld: false })
    endpoint: string;
}

/**
 * Rotación de suscripción (evento `pushsubscriptionchange` del service
 * worker). Va sin JWT porque el SW corre sin sesión: la fila se identifica
 * por `oldEndpoint`, que es una URL secreta que sólo conoce ese navegador.
 */
export class RotatePushDto {
    /** Endpoint que el navegador acaba de invalidar. */
    @IsOptional()
    @IsUrl({ require_tld: false })
    oldEndpoint?: string | null;

    @IsUrl({ require_tld: false })
    endpoint: string;

    @ValidateNested()
    @Type(() => PushKeysDto)
    keys: PushKeysDto;
}