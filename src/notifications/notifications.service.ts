import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

export interface NewInAppNotification {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string | null;
}

export interface NotificationsPage {
    data: Notification[];
    meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * Campanita del navbar: notificaciones in-app. Otros módulos la usan para
 * avisar (`create`); el usuario la lee y marca como leída desde el controller.
 */
@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private readonly repository: Repository<Notification>,
    ) { }

    async create(input: NewInAppNotification): Promise<Notification> {
        const notification = this.repository.create({
            userId: input.userId,
            type: input.type,
            channel: 'in_app',
            title: input.title,
            message: input.message,
            link: input.link ?? null,
            read: false,
        });
        return this.repository.save(notification);
    }

    async listMine(userId: string, page: number, limit: number, unreadOnly = false): Promise<NotificationsPage> {
        const [data, total] = await this.repository.findAndCount({
            where: unreadOnly ? { userId, read: false } : { userId },
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { data, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } };
    }

    unreadCount(userId: string): Promise<{ count: number }> {
        return this.repository.count({ where: { userId, read: false } }).then((count) => ({ count }));
    }

    async markRead(userId: string, id: string): Promise<Notification> {
        const notification = await this.repository.findOne({ where: { id, userId } });
        if (!notification) throw new NotFoundException('Notificación no encontrada.');
        if (!notification.read) {
            notification.read = true;
            notification.readAt = new Date();
            await this.repository.save(notification);
        }
        return notification;
    }

    async markAllRead(userId: string): Promise<{ updated: number }> {
        const result = await this.repository.update(
            { userId, read: false },
            { read: true, readAt: new Date() },
        );
        return { updated: result.affected ?? 0 };
    }
}
