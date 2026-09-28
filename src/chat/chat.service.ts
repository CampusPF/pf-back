import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Message } from './entities/message.entity';
import { ChatConversation, ConversationType } from './entities/chat-conversation.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { ChatContactDto } from './dto/chat-contact.dto';

interface ContactAccumulator {
    contact: User;
    courses: Course[];
}

@Injectable()
export class ChatService {
    constructor(
        @InjectRepository(Message)
        private readonly messagesRepository: Repository<Message>,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
        @InjectRepository(ChatConversation)
        private readonly conversationsRepository: Repository<ChatConversation>,
        @InjectRepository(ChatParticipant)
        private readonly participantsRepository: Repository<ChatParticipant>,
    ) {}

    // ──────────────────────────────────────────────────────────────
    // PUBLIC API — called by controller + gateway
    // ──────────────────────────────────────────────────────────────

    /**
     * Send a message. The controller/gateway pass receiverId; we resolve
     * (or create) the direct conversation between the two users, and save
     * the message under that conversation.
     */
    async sendMessage(senderId: string, receiverId: string, content: string): Promise<Message> {
        const conversation = await this.getOrCreateDirectConversation(senderId, receiverId);
        return this.saveMessage(senderId, conversation.id, content);
    }

    /**
     * Return the history of the direct conversation between two users.
     * If the conversation doesn't exist yet, return an empty array
     * (creating it lazily keeps this call pure for GET semantics).
     */
    async getConversation(userId: string, otherUserId: string): Promise<Message[]> {
        const conversation = await this.findDirectConversation(userId, otherUserId);
        if (!conversation) return [];
        return this.messagesRepository.find({
            where: { conversationId: conversation.id },
            order: { createdAt: 'ASC' },
        });
    }

    /**
     * Mark all messages in the direct conversation as read for `userId`
     * by bumping their `last_read_at` in chat_participants.
     * Returns the number of messages that were previously unread.
     */
    async markConversationAsRead(userId: string, otherUserId: string): Promise<number> {
        const conversation = await this.findDirectConversation(userId, otherUserId);
        if (!conversation) return 0;
        return this.markConversationAsReadById(userId, conversation.id);
    }

    /**
     * Total unread messages for a user across all their conversations.
     */
    async getUnreadCount(userId: string): Promise<number> {
        const memberships = await this.participantsRepository.find({
            where: { userId, isActive: true },
        });
        if (memberships.length === 0) return 0;

        let total = 0;
        for (const membership of memberships) {
            const since = membership.lastReadAt ?? new Date(0);
            const count = await this.messagesRepository
                .createQueryBuilder('m')
                .where('m.conversation_id = :cid', { cid: membership.conversationId })
                .andWhere('m.sender_id != :uid', { uid: userId })
                .andWhere('m.created_at > :since', { since })
                .getCount();
            total += count;
        }
        return total;
    }

    /**
     * List of contacts the user can chat with. Same shape as before, so
     * the frontend doesn't need to change.
     */
    async getContacts(userId: string): Promise<ChatContactDto[]> {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
        if (user.role === UserRole.ADMIN) {
            throw new ForbiddenException('Los administradores no participan del chat');
        }

        const contacts =
            user.role === UserRole.TEACHER
                ? await this.collectStudentsOfTeacher(userId)
                : await this.collectTeachersOfStudent(userId);
        contacts.delete(userId);

        const result = await Promise.all(
            [...contacts.values()].map(async ({ contact, courses }) => {
                const conversation = await this.findDirectConversation(userId, contact.id);
                const lastMessage = conversation
                    ? await this.messagesRepository.findOne({
                          where: { conversationId: conversation.id },
                          order: { createdAt: 'DESC' },
                      })
                    : null;
                const unreadCount = conversation
                    ? await this.countUnread(userId, conversation.id)
                    : 0;
                return {
                    user: {
                        id: contact.id,
                        name: contact.name,
                        avatarUrl: contact.avatarUrl ?? null,
                        role: contact.role,
                    },
                    courses: courses.map(({ id, slug, title }) => ({ id, slug, title })),
                    lastMessage: lastMessage
                        ? {
                              content: lastMessage.content,
                              senderId: lastMessage.senderId,
                              createdAt: lastMessage.createdAt,
                          }
                        : null,
                    unreadCount,
                };
            }),
        );

        return result.sort(
            (a, b) =>
                (b.lastMessage?.createdAt.getTime() ?? 0) -
                (a.lastMessage?.createdAt.getTime() ?? 0),
        );
    }

    // ──────────────────────────────────────────────────────────────
    // GROUP CHAT (per course)
    // ──────────────────────────────────────────────────────────────

    /**
     * Return (or create) the group conversation for a course.
     * All enrolled students + the teacher are participants.
     */
    async getOrCreateCourseConversation(courseId: string): Promise<ChatConversation> {
        let conversation = await this.conversationsRepository.findOne({
            where: { type: ConversationType.COURSE, courseId },
        });
        if (conversation) return conversation;

        conversation = await this.conversationsRepository.save(
            this.conversationsRepository.create({
                type: ConversationType.COURSE,
                courseId,
                studentId: null,
            }),
        );

        // Add the teacher + all active students as participants
        const enrollments = await this.enrollmentsRepository.find({
            where: { course: { id: courseId }, isActive: true },
            relations: { student: true, course: { instructor: true } },
        });

        const userIds = new Set<string>();
        for (const enrollment of enrollments) {
            if (enrollment.student) userIds.add(enrollment.student.id);
            if (enrollment.course?.instructor) userIds.add(enrollment.course.instructor.id);
        }

        for (const uid of userIds) {
            await this.participantsRepository.save(
                this.participantsRepository.create({
                    conversationId: conversation.id,
                    userId: uid,
                    isActive: true,
                }),
            );
        }
        return conversation;
    }

    async sendGroupMessage(userId: string, courseId: string, content: string): Promise<Message> {
        const conversation = await this.getOrCreateCourseConversation(courseId);
        await this.assertParticipant(userId, conversation.id);
        return this.saveMessage(userId, conversation.id, content);
    }

    async getCourseMessages(userId: string, courseId: string): Promise<Message[]> {
        const conversation = await this.getOrCreateCourseConversation(courseId);
        await this.assertParticipant(userId, conversation.id);
        return this.messagesRepository.find({
            where: { conversationId: conversation.id },
            order: { createdAt: 'ASC' },
        });
    }

    // ──────────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ──────────────────────────────────────────────────────────────

    private async saveMessage(
        senderId: string,
        conversationId: string,
        content: string,
    ): Promise<Message> {
        const message = this.messagesRepository.create({
            conversationId,
            senderId,
            content,
        });
        return this.messagesRepository.save(message);
    }

    private async findDirectConversation(
        userA: string,
        userB: string,
    ): Promise<ChatConversation | null> {
        // A direct conversation has exactly 2 participants: userA and userB.
        // Find conversations both belong to, of type DIRECT.
        const rows = await this.participantsRepository
            .createQueryBuilder('p')
            .innerJoin(ChatConversation, 'c', 'c.id = p.conversation_id')
            .where('c.type = :type', { type: ConversationType.DIRECT })
            .andWhere('p.user_id IN (:...users)', { users: [userA, userB] })
            .select('c.id', 'id')
            .addSelect('COUNT(DISTINCT p.user_id)', 'participant_count')
            .groupBy('c.id')
            .having('COUNT(DISTINCT p.user_id) = 2')
            .getRawMany<{ id: string; participant_count: string }>();

        if (rows.length === 0) return null;
        return this.conversationsRepository.findOne({ where: { id: rows[0].id } });
    }

    private async getOrCreateDirectConversation(
        userA: string,
        userB: string,
    ): Promise<ChatConversation> {
        if (userA === userB) {
            throw new ForbiddenException('No podés chatear con vos mismo');
        }

        const existing = await this.findDirectConversation(userA, userB);
        if (existing) return existing;

        // Verify both users exist and are not admin
        const [a, b] = await Promise.all([
            this.usersRepository.findOne({ where: { id: userA } }),
            this.usersRepository.findOne({ where: { id: userB } }),
        ]);
        if (!a || !b) throw new NotFoundException('Usuario no encontrado');
        if (a.role === UserRole.ADMIN || b.role === UserRole.ADMIN) {
            throw new ForbiddenException('Los administradores no participan del chat');
        }

        const conversation = await this.conversationsRepository.save(
            this.conversationsRepository.create({
                type: ConversationType.DIRECT,
                courseId: null,
                studentId: null,
            }),
        );

        await this.participantsRepository.save([
            this.participantsRepository.create({
                conversationId: conversation.id,
                userId: userA,
                isActive: true,
            }),
            this.participantsRepository.create({
                conversationId: conversation.id,
                userId: userB,
                isActive: true,
            }),
        ]);

        return conversation;
    }

    private async markConversationAsReadById(
        userId: string,
        conversationId: string,
    ): Promise<number> {
        const unread = await this.countUnread(userId, conversationId);
        await this.participantsRepository.update(
            { conversationId, userId },
            { lastReadAt: new Date() },
        );
        return unread;
    }

    private async countUnread(userId: string, conversationId: string): Promise<number> {
        const membership = await this.participantsRepository.findOne({
            where: { userId, conversationId },
        });
        if (!membership) return 0;
        const since = membership.lastReadAt ?? new Date(0);
        return this.messagesRepository
            .createQueryBuilder('m')
            .where('m.conversation_id = :cid', { cid: conversationId })
            .andWhere('m.sender_id != :uid', { uid: userId })
            .andWhere('m.created_at > :since', { since })
            .getCount();
    }

    private async assertParticipant(userId: string, conversationId: string): Promise<void> {
        const participant = await this.participantsRepository.findOne({
            where: { userId, conversationId, isActive: true },
        });
        if (!participant) {
            throw new ForbiddenException('No participás de esta conversación');
        }
    }

    private async collectTeachersOfStudent(
        studentId: string,
    ): Promise<Map<string, ContactAccumulator>> {
        const enrollments = await this.enrollmentsRepository.find({
            where: { student: { id: studentId }, isActive: true },
            relations: { course: { instructor: true } },
        });
        const contacts = new Map<string, ContactAccumulator>();
        for (const { course } of enrollments) {
            if (course?.instructor?.role !== UserRole.TEACHER) continue;
            this.addContact(contacts, course.instructor, course);
        }
        return contacts;
    }

    private async collectStudentsOfTeacher(
        teacherId: string,
    ): Promise<Map<string, ContactAccumulator>> {
        const enrollments = await this.enrollmentsRepository.find({
            where: { course: { instructor: { id: teacherId } }, isActive: true },
            relations: { student: true, course: true },
        });
        const contacts = new Map<string, ContactAccumulator>();
        for (const { student, course } of enrollments) {
            if (student?.role !== UserRole.STUDENT || !course) continue;
            this.addContact(contacts, student, course);
        }
        return contacts;
    }

    private addContact(
        contacts: Map<string, ContactAccumulator>,
        contact: User,
        course: Course,
    ): void {
        const entry = contacts.get(contact.id) ?? { contact, courses: [] };
        if (!entry.courses.some((c) => c.id === course.id)) entry.courses.push(course);
        contacts.set(contact.id, entry);
    }
}
