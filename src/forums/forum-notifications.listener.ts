import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, ForumReplyCreatedEvent, ForumSolutionMarkedEvent, ForumThreadCreatedEvent } from '../events';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';

interface Recipient {
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string;
  tag: string;
}

/**
 * Avisos del foro: campanita (in-app) y push. Corre fuera del flujo de quien
 * escribe, así que un fallo de notificación nunca devuelve error al alumno.
 * Nunca se avisa a quien hizo la acción.
 */
@Injectable()
export class ForumNotificationsListener {
  private readonly logger = new Logger(ForumNotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) { }

  /** Hilo nuevo en un curso: avisa al docente que lo dicta. */
  @OnEvent(EVENTS.FORUM_THREAD_CREATED, { async: true })
  async onThreadCreated(event: ForumThreadCreatedEvent): Promise<void> {
    if (!event.instructorId || event.instructorId === event.actorId) return;
    await this.send({
      userId: event.instructorId,
      type: 'forum_thread',
      title: `Nuevo hilo en ${event.courseTitle}`,
      message: `Abrieron un hilo: "${event.threadTitle}"`,
      link: threadLink(event.threadId),
      tag: `forum-${event.threadId}`,
    });
  }

  /** Respuesta nueva: avisa a todos los que ya participaban, menos a quien responde. */
  @OnEvent(EVENTS.FORUM_REPLY_CREATED, { async: true })
  async onReplyCreated(event: ForumReplyCreatedEvent): Promise<void> {
    const recipients = [...new Set(event.recipientIds)].filter((id) => id !== event.actorId);
    await Promise.all(
      recipients.map((userId) =>
        this.send({
          userId,
          type: 'forum_reply',
          title: 'Nueva respuesta en el foro',
          message: `Hay una respuesta en "${event.threadTitle}"`,
          link: threadLink(event.threadId),
          tag: `forum-${event.threadId}`,
        }),
      ),
    );
  }

  /** Solución marcada: avisa a quien escribió esa respuesta. */
  @OnEvent(EVENTS.FORUM_SOLUTION_MARKED, { async: true })
  async onSolutionMarked(event: ForumSolutionMarkedEvent): Promise<void> {
    if (event.postAuthorId === event.actorId) return;
    await this.send({
      userId: event.postAuthorId,
      type: 'forum_solution',
      title: 'Tu respuesta fue marcada como solución',
      message: `En "${event.threadTitle}" tu respuesta resolvió el hilo`,
      link: threadLink(event.threadId),
      tag: `forum-${event.threadId}`,
    });
  }

  private async send(recipient: Recipient): Promise<void> {
    try {
      await this.notifications.create({
        userId: recipient.userId,
        type: recipient.type,
        title: recipient.title,
        message: recipient.message,
        link: recipient.link,
      });
    } catch (error) {
      this.logger.warn(`No se pudo guardar la notificación del foro para ${recipient.userId}: ${describe(error)}`);
    }

    try {
      await this.push.sendToUser(recipient.userId, {
        title: recipient.title,
        body: recipient.message,
        url: recipient.link,
        tag: recipient.tag,
        icon: '/logo-campus.png',
      });
    } catch (error) {
      this.logger.warn(`No se pudo enviar el push del foro a ${recipient.userId}: ${describe(error)}`);
    }
  }
}

function threadLink(threadId: string): string {
  return `/dashboard/foros/hilo/${threadId}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
