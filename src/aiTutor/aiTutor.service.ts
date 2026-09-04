import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { User } from '../users/entities/user.entity';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from '../subscriptions/entities/subscription.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import type { AiProvider } from './providers/ai-provider.interface';

// Límite diario de mensajes para usuarios en plan Free.
// Los usuarios con cualquier plan pago tienen uso ilimitado.
const FREE_PLAN_DAILY_MESSAGE_LIMIT = 20;

@Injectable()
export class AiTutorService {
    constructor(
        @InjectRepository(Conversation)
        private readonly conversationsRepository: Repository<Conversation>,
        @InjectRepository(Message)
        private readonly messagesRepository: Repository<Message>,
        @InjectRepository(Lesson)
        private readonly lessonsRepository: Repository<Lesson>,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(Subscription)
        private readonly subscriptionsRepository: Repository<Subscription>,
        @Inject(AI_PROVIDER)
        private readonly aiProvider: AiProvider,
    ) { }

    async createConversation(dto: CreateConversationDto, userId: string): Promise<Conversation> {
        const lesson = await this.lessonsRepository.findOne({ where: { id: dto.lessonId } });
        if (!lesson) {
            throw new NotFoundException(`Lección con id ${dto.lessonId} no encontrada`);
        }

        const student = await this.usersRepository.findOne({ where: { id: userId } });
        if (!student) {
            throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
        }

        const conversation = this.conversationsRepository.create({
            student,
            lesson,
        });

        return this.conversationsRepository.save(conversation);
    }

    async findAllByUser(userId: string): Promise<Conversation[]> {
        return this.conversationsRepository.find({
            where: { student: { id: userId } },
            relations: { lesson: true },
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string, userId: string): Promise<Conversation> {
        const conversation = await this.conversationsRepository.findOne({
            where: { id },
            relations: { student: true, lesson: true, messages: true },
        });

        if (!conversation) {
            throw new NotFoundException(`Conversación con id ${id} no encontrada`);
        }

        if (conversation.student.id !== userId) {
            throw new ForbiddenException('Esta conversación no te pertenece');
        }

        conversation.messages.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        return conversation;
    }

    async sendMessage(
        conversationId: string,
        dto: CreateMessageDto,
        userId: string,
    ): Promise<{
        userMessage: { id: string; role: MessageRole; content: string; createdAt: Date };
        assistantMessage: { id: string; role: MessageRole; content: string; createdAt: Date };
    }> {
        const conversation = await this.findOne(conversationId, userId);

        await this.assertUnderDailyLimit(userId);

        const userMessage = await this.messagesRepository.save(
            this.messagesRepository.create({
                conversation,
                role: MessageRole.USER,
                content: dto.content,
            }),
        );

        const history = [...conversation.messages, userMessage].map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));

        const replyText = await this.aiProvider.generateReply(
            history,
            conversation.lesson?.title,
        );

        const assistantMessage = await this.messagesRepository.save(
            this.messagesRepository.create({
                conversation,
                role: MessageRole.ASSISTANT,
                content: replyText,
            }),
        );

        return {
            userMessage: { id: userMessage.id, role: userMessage.role, content: userMessage.content, createdAt: userMessage.createdAt },
            assistantMessage: { id: assistantMessage.id, role: assistantMessage.role, content: assistantMessage.content, createdAt: assistantMessage.createdAt },
        };
    }

    async remove(id: string, userId: string): Promise<void> {
        const conversation = await this.findOne(id, userId);
        await this.conversationsRepository.remove(conversation);
    }

    async getUsageToday(userId: string): Promise<{
        messagesUsedToday: number;
        dailyLimit: number | null; // null = ilimitado
        remaining: number | null;
    }> {
        const { startOfDay, endOfDay } = this.getTodayRange();

        const messagesUsedToday = await this.messagesRepository.count({
            where: {
                role: MessageRole.USER,
                conversation: { student: { id: userId } },
                createdAt: Between(startOfDay, endOfDay),
            },
        });

        const isUnlimited = await this.hasUnlimitedUsage(userId);
        const dailyLimit = isUnlimited ? null : FREE_PLAN_DAILY_MESSAGE_LIMIT;
        const remaining = dailyLimit === null ? null : Math.max(dailyLimit - messagesUsedToday, 0);

        return { messagesUsedToday, dailyLimit, remaining };
    }

    // --- Helpers privados ---

    private async assertUnderDailyLimit(userId: string): Promise<void> {
        const { messagesUsedToday, dailyLimit } = await this.getUsageToday(userId);

        if (dailyLimit !== null && messagesUsedToday >= dailyLimit) {
            throw new BadRequestException(
                `Alcanzaste el límite diario de ${dailyLimit} mensajes del plan gratuito. Actualizá tu plan para uso ilimitado.`,
            );
        }
    }

    private async hasUnlimitedUsage(userId: string): Promise<boolean> {
        const subscription = await this.subscriptionsRepository.findOne({
            where: { user: { id: userId } },
            order: { createdAt: 'DESC' },
        });

        if (!subscription) return false;

        const isActive = subscription.status === SubscriptionStatus.ACTIVE;
        const isNotExpired = subscription.endDate.getTime() >= Date.now();
        const isPremium = subscription.plan === SubscriptionPlan.PREMIUM;

        return isActive && isNotExpired && isPremium;
    }

    private getTodayRange(): { startOfDay: Date; endOfDay: Date } {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return { startOfDay, endOfDay };
    }
}