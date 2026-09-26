import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Message } from './entities/message.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

/**
 * Chat entre alumnos (premium) y profesores.
 *
 *  - ChatService: reglas de negocio (quién puede chatear con quién,
 *    verificación de premium, persistencia).
 *  - ChatController: endpoints REST (historial, marcar leído, contador).
 *  - ChatGateway: WebSocket para tiempo real (evento 'message:send' del
 *    cliente, evento 'message:new' a los participantes).
 *
 * El envío de mensajes NUEVOS va SOLO por WebSocket. El REST solo se usa
 * para historial y contadores.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            Message,
            User,
            Subscription,
            CourseEnrollment,
        ]),
        AuthModule,   // para JwtService (que usa el ChatGateway)
    ],
    controllers: [ChatController],
    providers: [ChatService, ChatGateway],
    exports: [ChatService],
})
export class ChatModule { }
