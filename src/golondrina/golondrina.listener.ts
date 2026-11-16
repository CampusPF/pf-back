import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChatMessageSentEvent, EVENTS, ForumReplyCreatedEvent } from '../events';
import { GolondrinaService } from './golondrina.service';

/**
 * «Avisame si responde el docente»: escucha el chat directo y las respuestas
 * del foro. GolondrinaService decide si corresponde (el que escribe tiene que
 * ser el instructor de un curso donde el alumno activó la acción).
 *
 * `async: true`: el mensaje del chat o el post del foro ya se guardaron; un
 * aviso que falla no puede romperle la respuesta a nadie.
 */
@Injectable()
export class GolondrinaListener {
    private readonly logger = new Logger(GolondrinaListener.name);

    constructor(private readonly golondrina: GolondrinaService) { }

    @OnEvent(EVENTS.CHAT_MESSAGE_SENT, { async: true })
    async onChatMessage(event: ChatMessageSentEvent): Promise<void> {
        await this.golondrina
            .onTeacherReplied(event.receiverId, event.senderId, { kind: 'chat', id: event.messageId })
            .catch((error: unknown) => this.logger.warn(`Golondrina (chat): ${String(error)}`));
    }

    @OnEvent(EVENTS.FORUM_REPLY_CREATED, { async: true })
    async onForumReply(event: ForumReplyCreatedEvent): Promise<void> {
        for (const recipientId of new Set(event.recipientIds)) {
            await this.golondrina
                .onTeacherReplied(recipientId, event.actorId, { kind: 'forum', id: event.postId, threadId: event.threadId })
                .catch((error: unknown) => this.logger.warn(`Golondrina (foro): ${String(error)}`));
        }
    }
}
