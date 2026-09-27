import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { Message } from './entities/message.entity';

/**
 * Chat con 2 tipos de conversación:
 *
 *  - 'course': la sala grupal del curso. Participantes: el profesor dueño +
 *    todos los alumnos inscriptos activos.
 *  - 'direct': chat privado alumno ↔ profesor. Participantes: 2 (el
 *    profesor del curso + 1 alumno).
 *
 * Un mismo curso tiene: 1 chat 'course' + 1 chat 'direct' por cada alumno
 * inscripto.
 *
 * Reglas:
 *  - Solo alumno ↔ profesor (nunca admin).
 *  - Un alumno desinscripto sigue viendo el historial, pero no puede mandar.
 *  - Todos los alumnos (free, premium, comprados) pueden chatear.
 */
@Injectable()
export class ChatService {
    constructor(
        @InjectRepository(Message)
        private readonly messagesRepository: Repository<Message>,
        @InjectRepository(ChatConversation)
        private readonly conversationsRepository: Repository<ChatConversation>,
        @InjectRepository(ChatParticipant)
        private readonly participantsRepository: Repository<ChatParticipant>,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(Course)
        private readonly coursesRepository: Repository<Course>,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
    ) { }

    /**
     * Devuelve el chat GRUPAL de un curso, o lo crea si no existe. Sincroniza
     * los participantes (profesor + alumnos inscriptos activos).
     *
     * Es idempotente: llamarlo dos veces no duplica nada.
     */
    async getOrCreateCourseConversation(courseId: string): Promise<ChatConversation> {
        const course = await this.coursesRepository.findOne({
            where: { id: courseId },
            relations: { instructor: true },
        });
        if (!course) throw new NotFoundException(`Curso con id ${courseId} no encontrado`);

        let conversation = await this.conversationsRepository.findOne({
            where: { courseId, type: 'course' },
        });

        if (!conversation) {
            conversation = await this.conversationsRepository.save(
                this.conversationsRepository.create({ courseId, type: 'course' }),
            );
        }

        await this.syncCourseParticipants(conversation.id, course);
        return conversation;
    }

    /**
     * Devuelve el chat DIRECTO entre un profesor y un alumno de un curso, o
     * lo crea si no existe. Los participantes son 2: el profesor y el alumno.
     *
     * Es idempotente: si ya existe, lo devuelve.
     */
    async getOrCreateDirectConversation(
        courseId: string,
        studentId: string,
    ): Promise<ChatConversation> {
        const course = await this.coursesRepository.findOne({
            where: { id: courseId },
            relations: { instructor: true },
        });
        if (!course) throw new NotFoundException(`Curso con id ${courseId} no encontrado`);
        if (!course.instructor) throw new NotFoundException('El curso no tiene instructor');

        let conversation = await this.conversationsRepository.findOne({
            where: { type: 'direct', courseId, studentId },
        });

        if (!conversation) {
            conversation = await this.conversationsRepository.save(
                this.conversationsRepository.create({
                    type: 'direct',
                    courseId,
                    studentId,
                }),
            );
        }

        // Participantes: el profesor y el alumno, ambos activos.
        await this.ensureParticipant(conversation.id, course.instructor.id, true);
        await this.ensureParticipant(conversation.id, studentId, true);

        return conversation;
    }

    /**
     * Sincroniza los participantes del chat grupal con el estado actual del
     * curso: agrega al profesor y a todos los alumnos inscriptos activos;
     * marca como inactivos a los que ya no tienen inscripción activa.
     */
    private async syncCourseParticipants(conversationId: string, course: Course): Promise<void> {
        if (course.instructor) {
            await this.ensureParticipant(conversationId, course.instructor.id, true);
        }

        const enrollments = await this.enrollmentsRepository.find({
            where: { course: { id: course.id }, isActive: true },
            relations: { student: true },
        });
        for (const enrollment of enrollments) {
            await this.ensureParticipant(conversationId, enrollment.student.id, true);
        }

        const activeStudentIds = enrollments.map((e) => e.student.id);
        const allParticipants = await this.participantsRepository.find({
            where: { conversationId },
            relations: { user: true },
        });
        for (const participant of allParticipants) {
            if (participant.user.role === UserRole.TEACHER) continue;
            if (!activeStudentIds.includes(participant.userId)) {
                if (participant.isActive) {
                    participant.isActive = false;
                    await this.participantsRepository.save(participant);
                }
            }
        }
    }

    /** Crea un participante si no existe, o lo reactiva si estaba inactivo. */
    private async ensureParticipant(
        conversationId: string,
        userId: string,
        isActive: boolean,
    ): Promise<ChatParticipant> {
        let participant = await this.participantsRepository.findOne({
            where: { conversationId, userId },
        });
        if (!participant) {
            participant = this.participantsRepository.create({
                conversationId,
                userId,
                isActive,
            });
            return this.participantsRepository.save(participant);
        }
        if (participant.isActive !== isActive) {
            participant.isActive = isActive;
            return this.participantsRepository.save(participant);
        }
        return participant;
    }

    /**
     * Manda un mensaje a un chat.
     *
     * Verifica que el user sea participante ACTIVO del chat (que hoy significa
     * que sigue inscripto al curso, o que es el profesor dueño).
     */
    async sendMessage(
        senderId: string,
        conversationId: string,
        content: string,
    ): Promise<Message> {
        const participant = await this.assertCanSend(senderId, conversationId);

        const message = this.messagesRepository.create({
            senderId,
            conversationId: participant.conversationId,
            content,
        });
        return this.messagesRepository.save(message);
    }

    /**
     * Historial de un chat. Verifica que el user sea participante (activo
     * o inactivo: los desinscriptos siguen viendo el historial).
     */
    async getConversation(userId: string, conversationId: string): Promise<Message[]> {
        await this.assertIsParticipant(userId, conversationId);
        return this.messagesRepository.find({
            where: { conversationId },
            order: { createdAt: 'ASC' },
        });
    }

    /**
     * Marca el chat como leído: actualiza `lastReadAt` del participante a
     * "ahora". Devuelve cuántos mensajes había sin leer hasta este momento.
     */
    async markConversationAsRead(userId: string, conversationId: string): Promise<number> {
        const participant = await this.assertIsParticipant(userId, conversationId);

        const since = participant.lastReadAt ?? new Date(0);
        const unread = await this.messagesRepository
            .createQueryBuilder('m')
            .where('m.conversation_id = :conversationId', { conversationId })
            .andWhere('m.sender_id != :userId', { userId })
            .andWhere('m.created_at > :since', { since })
            .getCount();

        participant.lastReadAt = new Date();
        await this.participantsRepository.save(participant);

        return unread;
    }

    /**
     * Mis conversaciones, de los 2 tipos:
     *  - 'course': la sala grupal de cada curso en la que participo.
     *  - 'direct': cada chat privado en el que participo.
     *
     * Para cada una: último mensaje, participantes y no leídos.
     */
    async getMyConversations(userId: string) {
        const participations = await this.participantsRepository.find({
            where: { userId },
            relations: {
                conversation: {
                    course: { instructor: true },
                    student: true,
                },
            },
        });

        const result = [];
        for (const p of participations) {
            const conversation = p.conversation;

            const lastMessage = await this.messagesRepository.findOne({
                where: { conversationId: conversation.id },
                order: { createdAt: 'DESC' },
            });

            const since = p.lastReadAt ?? new Date(0);
            const unreadCount = await this.messagesRepository
                .createQueryBuilder('m')
                .where('m.conversation_id = :conversationId', { conversationId: conversation.id })
                .andWhere('m.sender_id != :userId', { userId })
                .andWhere('m.created_at > :since', { since })
                .getCount();

            result.push({
                id: conversation.id,
                type: conversation.type,
                course: conversation.course
                    ? { id: conversation.course.id, title: conversation.course.title }
                    : null,
                otherParticipant:
                    conversation.type === 'direct'
                        ? await this.getOtherParticipant(conversation.id, userId)
                        : null,
                participants: await this.getParticipantInfo(conversation.id),
                lastMessage: lastMessage
                    ? {
                        id: lastMessage.id,
                        senderId: lastMessage.senderId,
                        content: lastMessage.content,
                        createdAt: lastMessage.createdAt,
                    }
                    : null,
                unreadCount,
                isActive: p.isActive,
            });
        }

        return result;
    }

    /** El otro participante de un chat directo (el que no soy yo). */
    private async getOtherParticipant(conversationId: string, myId: string) {
        const other = await this.participantsRepository.findOne({
            where: { conversationId, userId: Not(myId) },
            relations: { user: true },
        });
        if (!other) return null;
        return {
            id: other.user.id,
            name: other.user.name,
            role: other.user.role,
        };
    }

    /** Lista de participantes (id, name, role) de un chat. */
    private async getParticipantInfo(conversationId: string) {
        const participants = await this.participantsRepository.find({
            where: { conversationId },
            relations: { user: true },
        });
        return participants.map((p) => ({
            id: p.user.id,
            name: p.user.name,
            role: p.user.role,
            isActive: p.isActive,
        }));
    }

    /** Total de mensajes no leídos del user, sumando todos sus chats. */
    async getUnreadCount(userId: string): Promise<number> {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`Usuario con id ${userId} no encontrado`);
        if (user.role === UserRole.ADMIN) {
            throw new ForbiddenException('Los administradores no participan del chat');
        }

        const participations = await this.participantsRepository.find({
            where: { userId },
        });

        let total = 0;
        for (const p of participations) {
            const since = p.lastReadAt ?? new Date(0);
            total += await this.messagesRepository
                .createQueryBuilder('m')
                .where('m.conversation_id = :conversationId', { conversationId: p.conversationId })
                .andWhere('m.sender_id != :userId', { userId })
                .andWhere('m.created_at > :since', { since })
                .getCount();
        }
        return total;
    }

    // --- helpers de autorización ---

    private async assertCanSend(userId: string, conversationId: string): Promise<ChatParticipant> {
        const participant = await this.assertIsParticipant(userId, conversationId);

        if (!participant.isActive) {
            throw new ForbiddenException(
                'Ya no estás inscripto en este curso: podés ver el historial, pero no mandar mensajes nuevos.',
            );
        }

        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (user?.role === UserRole.ADMIN) {
            throw new ForbiddenException('Los administradores no participan del chat');
        }

        return participant;
    }

    private async assertIsParticipant(
        userId: string,
        conversationId: string,
    ): Promise<ChatParticipant> {
        const participant = await this.participantsRepository.findOne({
            where: { conversationId, userId },
        });
        if (!participant) {
            throw new ForbiddenException('No participás en este chat');
        }
        return participant;
    }
}
