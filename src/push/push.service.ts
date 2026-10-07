import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import webPush from 'web-push';
import { Repository } from 'typeorm';
import { PushSubscription } from './entities/push-subscription.entity';

export interface PushPayload {
    title: string;
    body: string;
    url: string;
    tag: string;
    icon: string;
}

/** Saca el status y el cuerpo del error de web-push, que no tipa nada. */
function describePushError(error: unknown): { statusCode?: number; body: string } {
    if (typeof error !== 'object' || error === null) {
        return { body: String(error) };
    }
    const candidate = error as { statusCode?: unknown; body?: unknown; message?: unknown };
    return {
        statusCode:
            typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined,
        body:
            typeof candidate.body === 'string' && candidate.body
                ? candidate.body.slice(0, 200)
                : typeof candidate.message === 'string'
                    ? candidate.message
                    : 'sin detalle',
    };
}

@Injectable()
export class PushService implements OnModuleInit {
    private readonly logger = new Logger(PushService.name);
    private configured = false;

    constructor(
        private readonly config: ConfigService,
        @InjectRepository(PushSubscription)
        private readonly subscriptionsRepository: Repository<PushSubscription>,
    ) { }

    onModuleInit(): void {
        const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
        const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
        const subject = this.config.get<string>('VAPID_SUBJECT');
        this.logger.log(`VAPID configured: ${Boolean(publicKey && privateKey && subject)}`);
        if (!publicKey || !privateKey || !subject) return;

        webPush.setVapidDetails(subject, publicKey, privateKey);
        this.configured = true;
    }

    async subscribe(
        userId: string,
        subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    ): Promise<void> {
        const existing = await this.subscriptionsRepository.findOne({
            where: { endpoint: subscription.endpoint },
        });
        if (existing) {
            existing.userId = userId;
            existing.p256dh = subscription.keys.p256dh;
            existing.auth = subscription.keys.auth;
            await this.subscriptionsRepository.save(existing);
            return;
        }

        await this.subscriptionsRepository.save(
            this.subscriptionsRepository.create({
                userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
            }),
        );
    }

    /**
     * Rotación: el navegador invalidó `oldEndpoint` y creó otro. Mueve la
     * suscripción al endpoint nuevo conservando el usuario.
     *
     * Corre SIN sesión (el service worker no tiene el JWT), así que el dueño
     * se deduce de `oldEndpoint`: una URL larga y secreta que sólo conoce ese
     * navegador. Si no se encuentra, no se crea nada — sin fila previa no hay
     * forma de saber a qué usuario pertenece, y adivinar sería peor.
     */
    async rotate(
        oldEndpoint: string | null | undefined,
        subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    ): Promise<{ rotated: boolean }> {
        if (!oldEndpoint) return { rotated: false };

        const existing = await this.subscriptionsRepository.findOne({
            where: { endpoint: oldEndpoint },
        });
        if (!existing) {
            this.logger.debug(
                `Rotación sin suscripción previa para ${oldEndpoint.slice(0, 48)}`,
            );
            return { rotated: false };
        }

        // El endpoint nuevo puede existir ya (el navegador lo recreó y el
        // front alcanzó a registrarlo): en ese caso se borra el duplicado.
        if (subscription.endpoint !== oldEndpoint) {
            await this.subscriptionsRepository.delete({ endpoint: subscription.endpoint });
        }

        existing.endpoint = subscription.endpoint;
        existing.p256dh = subscription.keys.p256dh;
        existing.auth = subscription.keys.auth;
        await this.subscriptionsRepository.save(existing);

        this.logger.log(`Suscripción push rotada para el usuario ${existing.userId}`);
        return { rotated: true };
    }

    async unsubscribe(endpoint: string): Promise<number> {
        const result = await this.subscriptionsRepository.delete({ endpoint });
        const removed = result.affected ?? 0;
        if (removed === 0) {
            this.logger.debug(`No push subscription found for endpoint ${endpoint.slice(0, 48)}`);
        }
        return removed;
    }

    async sendToUser(userId: string, payload: PushPayload): Promise<void> {
        /* Antes era un `return` mudo: sin VAPID no se mandaba nada y no
           quedaba rastro en los logs, así que desde afuera era idéntico a
           "se mandó y no llegó". Ahora al menos se ve por qué. */
        if (!this.configured) {
            this.logger.warn(
                `Web Push sin configurar (faltan VAPID_*): no se envía "${payload.tag}" al usuario ${userId}`,
            );
            return;
        }

        const subscriptions = await this.subscriptionsRepository.find({ where: { userId } });
        if (subscriptions.length === 0) {
            this.logger.debug(`El usuario ${userId} no tiene suscripciones push activas`);
            return;
        }

        await Promise.all(subscriptions.map(async (stored) => {
            try {
                await webPush.sendNotification(
                    {
                        endpoint: stored.endpoint,
                        keys: { p256dh: stored.p256dh, auth: stored.auth },
                    },
                    JSON.stringify(payload),
                );
            } catch (error) {
                const { statusCode, body } = describePushError(error);
                /* 404/410 = el endpoint ya no existe (el navegador lo rotó o
                   el usuario desinstaló). 401/403 = las VAPID no coinciden con
                   las que firmaron esta suscripción, típico de haber
                   regenerado las claves. En los dos casos la fila ya no sirve. */
                if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 410) {
                    await this.subscriptionsRepository.delete({ id: stored.id });
                    this.logger.warn(
                        `Suscripción ${stored.id} descartada (HTTP ${statusCode}). ` +
                        `Si esto pasa en masa, revisá que las claves VAPID no hayan cambiado.`,
                    );
                } else {
                    this.logger.warn(
                        `Falló el envío push a la suscripción ${stored.id} (HTTP ${statusCode ?? '???'}): ${body}`,
                    );
                }
            }
        }));
    }

    async sendTestToUser(userId: string): Promise<{ sent: boolean }> {
        if (!this.configured) {
            throw new Error('Web Push no está configurado.');
        }
        await this.sendToUser(userId, {
            title: 'Prueba de notificaciones',
            body: 'Las notificaciones del navegador están funcionando.',
            url: '/dashboard/chats',
            tag: 'push-test',
            icon: '/logo-campus.png',
        });
        return { sent: true };
    }

    async cleanupSubscriptionsForDevelopment(): Promise<{ checked: number; removed: number }> {
        if (!this.configured) {
            throw new Error('Web Push no está configurado.');
        }
        const subscriptions = await this.subscriptionsRepository.find();
        let removed = 0;
        await Promise.all(subscriptions.map(async (stored) => {
            try {
                const result = await webPush.sendNotification(
                    {
                        endpoint: stored.endpoint,
                        keys: { p256dh: stored.p256dh, auth: stored.auth },
                    },
                    undefined,
                    { TTL: 0 },
                );
                if (result.statusCode < 200 || result.statusCode >= 300) {
                    await this.subscriptionsRepository.delete({ id: stored.id });
                    removed += 1;
                }
            } catch (error) {
                await this.subscriptionsRepository.delete({ id: stored.id });
                removed += 1;
            }
        }));
        return { checked: subscriptions.length, removed };
    }
}