import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from '../subscriptions/entities/subscription.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Message } from './entities/message.entity';

@Injectable()
export class ChatService {
    constructor(
        @InjectRepository(Message)
        private readonly messagesRepository: Repository<Message>,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(Subscription)
        private readonly subscriptionsRepository: Repository<Subscription>,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
    ) { }

    async sendMessage(senderId: string, receiverId: string, content: string): Promise<Message> {
        const { studentId } = await this.assertChatParticipants(senderId, receiverId);
        await this.assertSharedActiveCourse(studentId, senderId === studentId ? receiverId : senderId);

        if (senderId === studentId) {
            const hasPremiumSubscription = await this.subscriptionsRepository.exists({
                where: {
                    user: { id: studentId },
                    status: SubscriptionStatus.ACTIVE,
                    plan: SubscriptionPlan.PREMIUM,
                },
            });
            if (!hasPremiumSubscription) {
                throw new ForbiddenException('Necesitás una suscripción premium activa para enviar mensajes');
            }
        }

        const message = this.messagesRepository.create({ senderId, receiverId, content });
        return this.messagesRepository.save(message);
    }

    async getConversation(userId: string, otherUserId: string): Promise<Message[]> {
        const { studentId, teacherId } = await this.assertChatParticipants(userId, otherUserId);
        await this.assertSharedActiveCourse(studentId, teacherId);

        return this.messagesRepository.find({
            where: [
                { senderId: userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: userId },
            ],
            order: { createdAt: 'ASC' },
        });
    }

    async markConversationAsRead(userId: string, otherUserId: string): Promise<number> {
        const { studentId, teacherId } = await this.assertChatParticipants(userId, otherUserId);
        await this.assertSharedActiveCourse(studentId, teacherId);

        const result = await this.messagesRepository.update(
            { senderId: otherUserId, receiverId: userId, readAt: IsNull() },
            { readAt: new Date() },
        );
        return result.affected ?? 0;
    }

    async getUnreadCount(userId: string): Promise<number> {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
        if (user.role === UserRole.ADMIN) {
            throw new ForbiddenException('Los administradores no participan del chat');
        }

        return this.messagesRepository.count({
            where: { receiverId: userId, readAt: IsNull() },
        });
    }

    private async assertChatParticipants(
        firstUserId: string,
        secondUserId: string,
    ): Promise<{ studentId: string; teacherId: string }> {
        const [firstUser, secondUser] = await Promise.all([
            this.usersRepository.findOne({ where: { id: firstUserId } }),
            this.usersRepository.findOne({ where: { id: secondUserId } }),
        ]);

        if (!firstUser) throw new NotFoundException(`Usuario con id ${firstUserId} no encontrado`);
        if (!secondUser) throw new NotFoundException(`Usuario con id ${secondUserId} no encontrado`);

        const validPair =
            (firstUser.role === UserRole.STUDENT && secondUser.role === UserRole.TEACHER) ||
            (firstUser.role === UserRole.TEACHER && secondUser.role === UserRole.STUDENT);
        if (!validPair) {
            throw new ForbiddenException('El chat solo está permitido entre alumnos y profesores');
        }

        return firstUser.role === UserRole.STUDENT
            ? { studentId: firstUser.id, teacherId: secondUser.id }
            : { studentId: secondUser.id, teacherId: firstUser.id };
    }

    private async assertSharedActiveCourse(studentId: string, teacherId: string): Promise<void> {
        const enrollment = await this.enrollmentsRepository.findOne({
            where: {
                student: { id: studentId },
                course: { instructor: { id: teacherId } },
                isActive: true,
            },
        });

        if (!enrollment) {
            throw new ForbiddenException('Solo podés chatear con profesores de tus cursos activos');
        }
    }
}
