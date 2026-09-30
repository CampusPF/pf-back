import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTutorService } from './aiTutor.service';
import { AiTutorController } from './aiTutor.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { User } from '../users/entities/user.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';
import { AuthModule } from '../auth/auth.module';
import { LessonsModule } from '../lessons/lessons.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { FailoverAiProvider } from './providers/failover-ai.provider';

@Module({
    imports: [
        TypeOrmModule.forFeature([Conversation, Message, Lesson, User, CourseEnrollment, LessonProgress]),
        AuthModule,
        LessonsModule, // LessonsAccessService: misma regla de acceso que el reproductor
        SubscriptionsModule, // hasActiveSubscription: uso ilimitado del tutor en Premium
    ],
    controllers: [AiTutorController],
    providers: [
        AiTutorService,
        GeminiProvider,
        GroqProvider,
        // El servicio sólo conoce AI_PROVIDER; el failover decide Gemini/Groq
        // según AI_PROVIDER y las keys presentes en el .env.
        { provide: AI_PROVIDER, useClass: FailoverAiProvider },
    ],
})
export class AiTutorModule { }
