import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Único punto donde se instancia el cliente de Stripe. Se crea una sola vez
 * (es un singleton de Nest) y se reusa en cada request — no instanciar
 * `new Stripe()` por request.
 *
 * STRIPE_SECRET_KEY es `requiredInProd`: en desarrollo se puede levantar la
 * app sin ella, pero cualquier endpoint de pagos responde 503 hasta que esté
 * configurada, en vez de fallar con un error críptico de Stripe.
 */
@Injectable()
export class StripeService {
    private readonly logger = new Logger(StripeService.name);
    private readonly client: Stripe | null;
    private readonly webhookSecret: string | undefined;

    constructor(config: ConfigService) {
        const secretKey = config.get<string>('STRIPE_SECRET_KEY');
        this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');

        if (!secretKey) {
            this.logger.warn(
                'STRIPE_SECRET_KEY no configurada: los endpoints de /payments responderán 503.',
            );
            this.client = null;
            return;
        }

        // Sin apiVersion fija: usa la versión por defecto de la cuenta. Fijarla
        // acá obliga a bumpearla a mano en cada upgrade del dashboard.
        this.client = new Stripe(secretKey);
    }

    /** Cliente de Stripe ya configurado, o 503 si falta la secret key. */
    get stripe(): Stripe {
        if (!this.client) {
            throw new ServiceUnavailableException(
                'Pasarela de pagos no configurada (falta STRIPE_SECRET_KEY).',
            );
        }
        return this.client;
    }

    /**
     * Verifica la firma del webhook contra el body CRUDO (bytes exactos) y
     * devuelve el evento tipado. Lanza si la firma no valida o si falta el
     * webhook secret — el controller traduce eso a un 400.
     */
    constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
        if (!this.webhookSecret) {
            throw new Error('STRIPE_WEBHOOK_SECRET no configurada');
        }
        return this.stripe.webhooks.constructEvent(
            rawBody,
            signature,
            this.webhookSecret,
        );
    }
}
