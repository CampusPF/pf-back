import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Message } from './entities/message.entity';
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
    ) { }

    async sendMessage(senderId: string, receiverId: string, content: string): Promise<Message> {
        await this.assertCanChat(senderId, receiverId);

        const message = this.messagesRepository.create({ senderId, receiverId, content });
        return this.messagesRepository.save(message);
    }

    async getConversation(userId: string, otherUserId: string): Promise<Message[]> {
        await this.assertCanChat(userId, otherUserId);

        return this.messagesRepository.find({
            where: [
                { senderId: userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: userId },
            ],
            order: { createdAt: 'ASC' },
        });
    }

    async markConversationAsRead(userId: string, otherUserId: string): Promise<number> {
        await this.assertCanChat(userId, otherUserId);

        const result = await this.messagesRepository.update(
            { senderId: otherUserId, receiverId: userId, readAt: IsNull() },
            { readAt: new Date() },
        );
        return result.affected ?? 0;
    }

    async getUnreadCount(userId: string): Promise<number> {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`Usuario con id ${userId} no encontrado`);

        return this.messagesRepository.count({
            where: { receiverId: userId, readAt: IsNull() },
        });
    }

    async countUnreadFromSender(receiverId: string, senderId: string): Promise<number> {
        return this.messagesRepository.count({
            where: { receiverId, senderId, readAt: IsNull() },
        });
    }
    /**
     * Con quién puede chatear el usuario: los mismos pares que después acepta
     * assertCanChat. Para un alumno, los docentes de sus cursos activos; para
     * un docente, los alumnos inscriptos (activos) en sus cursos más los
     * admins; para un admin, todos los docentes activos (con sus cursos, para
     * saber de quién se trata). Ordenado por el mensaje más reciente; los
     * contactos sin mensajes van al final.
     */
    async getContacts(userId: string): Promise<ChatContactDto[]> {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`Usuario con id ${userId} no encontrado`);

        let contacts: Map<string, ContactAccumulator>;
        if (user.role === UserRole.ADMIN) {
            contacts = await this.collectTeachersForAdmin();
        } else if (user.role === UserRole.TEACHER) {
            contacts = await this.collectStudentsOfTeacher(userId);
            for (const admin of await this.findActiveUsers(UserRole.ADMIN)) {
                contacts.set(admin.id, { contact: admin, courses: [] });
            }
        } else {
            contacts = await this.collectTeachersOfStudent(userId);
        }

        const result = await Promise.all(
            [...contacts.values()].map(async ({ contact, courses }) => ({
                user: {
                    id: contact.id,
                    name: contact.name,
                    avatarUrl: contact.avatarUrl ?? null,
                    role: contact.role,
                },
                courses: courses.map(({ id, slug, title }) => ({ id, slug, title })),
                lastMessage: await this.findLastMessage(userId, contact.id),
                unreadCount: await this.messagesRepository.count({
                    where: { senderId: contact.id, receiverId: userId, readAt: IsNull() },
                }),
            })),
        );

        return result.sort(
            (a, b) =>
                (b.lastMessage?.createdAt.getTime() ?? 0) - (a.lastMessage?.createdAt.getTime() ?? 0),
        );
    }

    private async collectTeachersOfStudent(studentId: string): Promise<Map<string, ContactAccumulator>> {
        const enrollments = await this.enrollmentsRepository.find({
            where: { student: { id: studentId }, isActive: true },
            relations: { course: { instructor: true } },
        });

        const contacts = new Map<string, ContactAccumulator>();
        for (const { course } of enrollments) {
            // Mismo criterio que assertChatParticipants: sólo alumno↔docente.
            if (course?.instructor?.role !== UserRole.TEACHER) continue;
            this.addContact(contacts, course.instructor, course);
        }
        return contacts;
    }

    private async collectStudentsOfTeacher(teacherId: string): Promise<Map<string, ContactAccumulator>> {
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

    private async collectTeachersForAdmin(): Promise<Map<string, ContactAccumulator>> {
        const teachers = await this.usersRepository.find({
            where: { role: UserRole.TEACHER, status: UserStatus.ACTIVE },
            relations: { coursesCreated: true },
            order: { name: 'ASC' },
        });

        const contacts = new Map<string, ContactAccumulator>();
        for (const teacher of teachers) {
            contacts.set(teacher.id, {
                contact: teacher,
                courses: (teacher.coursesCreated ?? []).filter((course) => course.isActive),
            });
        }
        return contacts;
    }

    private findActiveUsers(role: UserRole): Promise<User[]> {
        return this.usersRepository.find({
            where: { role, status: UserStatus.ACTIVE },
            order: { name: 'ASC' },
        });
    }

    private addContact(contacts: Map<string, ContactAccumulator>, contact: User, course: Course): void {
        const entry = contacts.get(contact.id) ?? { contact, courses: [] };
        if (!entry.courses.some((c) => c.id === course.id)) entry.courses.push(course);
        contacts.set(contact.id, entry);
    }

    private async findLastMessage(
        userId: string,
        otherUserId: string,
    ): Promise<ChatContactDto['lastMessage']> {
        const last = await this.messagesRepository.findOne({
            where: [
                { senderId: userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: userId },
            ],
            order: { createdAt: 'DESC' },
        });
        return last ? { content: last.content, senderId: last.senderId, createdAt: last.createdAt } : null;
    }

    /**
     * Pares permitidos: alumno↔docente (con un curso activo en común) y
     * admin↔docente (soporte interno, sin condición de curso). Admin↔alumno
     * y admin↔admin no: el alumno se comunica con su docente, no con la
     * administración. Cualquier alumno con el curso activo puede escribirle a
     * su docente: el chat no es un beneficio exclusivo de Premium.
     */
    private async assertCanChat(firstUserId: string, secondUserId: string): Promise<void> {
        const [firstUser, secondUser] = await Promise.all([
            this.usersRepository.findOne({ where: { id: firstUserId } }),
            this.usersRepository.findOne({ where: { id: secondUserId } }),
        ]);

        if (!firstUser) throw new NotFoundException(`Usuario con id ${firstUserId} no encontrado`);
        if (!secondUser || secondUser.status !== UserStatus.ACTIVE) {
            throw new NotFoundException(`Usuario con id ${secondUserId} no encontrado`);
        }

        const roles = new Set([firstUser.role, secondUser.role]);
        const isPair = (a: UserRole, b: UserRole) => roles.size === 2 && roles.has(a) && roles.has(b);

        if (isPair(UserRole.ADMIN, UserRole.TEACHER)) return;

        if (isPair(UserRole.STUDENT, UserRole.TEACHER)) {
            const [student, teacher] =
                firstUser.role === UserRole.STUDENT ? [firstUser, secondUser] : [secondUser, firstUser];
            return this.assertSharedActiveCourse(student.id, teacher.id);
        }

        throw new ForbiddenException(
            'El chat sólo está permitido entre alumnos y docentes, o entre docentes y administradores',
        );
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
