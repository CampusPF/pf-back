import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Message } from './entities/message.entity';
import { User } from '../users/entities/user.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Message,
            User,
            CourseEnrollment,
            ChatConversation,
            ChatParticipant,
        ]),
        AuthModule,
    ],
    controllers: [ChatController],
    providers: [ChatService, ChatGateway],
    exports: [ChatService],
})
export class ChatModule { }
