import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { Message } from './entities/message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

/**
 * Chat grupal por curso.
 *
 *  - ChatService: reglas de negocio (participantes, sync con inscripciones,
 *    persistencia, no leídos).
 *  - ChatController: endpoints REST (mis chats, historial, marcar leído,
 *    contador global).
 *  - ChatGateway: WebSocket para tiempo real. El cliente emite 'message:send'
 *    con { conversationId, content } y el server emite 'message:new' a todos
 *    los participantes de esa conversación (room `conversation:<id>`).
 *
 * El envío de mensajes NUEVOS va SOLO por WebSocket. El REST solo se usa
 * para historial y contadores.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            ChatConversation,
            ChatParticipant,
            Message,
            User,
            Course,
            CourseEnrollment,
        ]),
        AuthModule,   // para JwtService (que usa el ChatGateway)
    ],
    controllers: [ChatController],
    providers: [ChatService, ChatGateway],
    exports: [ChatService],
})
export class ChatModule { }
