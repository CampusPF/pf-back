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

    async unsubscribe(endpoint: string): Promise<number> {
        const result = await this.subscriptionsRepository.delete({ endpoint });
        const removed = result.affected ?? 0;
        if (removed === 0) {
            this.logger.debug(`No push subscription found for endpoint ${endpoint.slice(0, 48)}`);
        }
        return removed;
    }

    async sendToUser(userId: string, payload: PushPayload): Promise<void> {
        if (!this.configured) return;

        try {
            const subscriptions = await this.subscriptionsRepository.find({ where: { userId } });
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
                    const statusCode = this.getStatusCode(error);
                    if (this.isDeadSubscriptionStatus(statusCode)) {
                        await this.deleteSubscriptionSafely(stored.id);
                    } else {
                        this.logger.warn(`Web Push delivery failed for user ${userId}`);
                    }
                }
            }));
        } catch (error) {
            this.logger.warn(
                `Web Push delivery failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Manda el mismo push a todos los usuarios con al menos una suscripción,
     * excepto (opcionalmente) a uno. Se usa para anuncios generales: curso
     * nuevo, evento, promo, etc. NO manda uno por navegador: agrupa por
     * usuario y manda al primer endpoint que encuentre.
     */
    async sendToAll(
        payload: PushPayload,
        options?: { excludeUserId?: string },
    ): Promise<{ sent: number; failed: number }> {
        let sent = 0;
        let failed = 0;
        try {
            if (this.configured) {
                const query = this.subscriptionsRepository
                    .createQueryBuilder('sub')
                    .distinctOn(['sub.user_id'])
                    .orderBy('sub.user_id', 'ASC')
                    .addOrderBy('sub.created_at', 'ASC')
                    .addOrderBy('sub.id', 'ASC');

                if (options?.excludeUserId) {
                    query.where('sub.user_id != :exclude', { exclude: options.excludeUserId });
                }

                const subscriptions = await query.getMany();
                await Promise.all(
                    subscriptions.map(async (stored) => {
                        try {
                            await webPush.sendNotification(
                                {
                                    endpoint: stored.endpoint,
                                    keys: { p256dh: stored.p256dh, auth: stored.auth },
                                },
                                JSON.stringify(payload),
                            );
                            sent++;
                        } catch (error) {
                            failed++;
                            if (this.isDeadSubscriptionStatus(this.getStatusCode(error))) {
                                await this.deleteSubscriptionSafely(stored.id);
                            }
                        }
                    }),
                );
            }
        } catch {
            failed++;
        }

        this.logger.log(`Broadcast push: ${sent} enviados, ${failed} fallidos`);
        return { sent, failed };
    }

    private getStatusCode(error: unknown): unknown {
        return typeof error === 'object' && error !== null && 'statusCode' in error
            ? (error as { statusCode?: unknown }).statusCode
            : undefined;
    }

    private isDeadSubscriptionStatus(statusCode: unknown): boolean {
        return statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 410;
    }

    private async deleteSubscriptionSafely(id: string): Promise<void> {
        try {
            await this.subscriptionsRepository.delete({ id });
        } catch {
            // A failed prune must not interrupt push delivery or broadcast logging.
        }
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