import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTutorService } from './aiTutor.service';
import { AiTutorController } from './aiTutor.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { AuthModule } from '../auth/auth.module';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import { MockAiProvider } from './providers/mock-ai.provider';

@Module({
    imports: [
        TypeOrmModule.forFeature([Conversation, Message, Lesson, User, Subscription]),
        AuthModule,
    ],
    controllers: [AiTutorController],
    providers: [
        AiTutorService,
        {
            provide: AI_PROVIDER,
            useClass: MockAiProvider, // 👈 reemplazar por AnthropicProvider/OpenAiProvider cuando decidas
        },
    ],
})
export class AiTutorModule { }