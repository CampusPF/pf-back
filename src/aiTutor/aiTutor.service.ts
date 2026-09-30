import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Inject,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';
import { LessonsAccessService } from '../lessons/lessons-access.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import type { AiChatMessage, AiProvider } from './providers/ai-provider.interface';
import { buildTutorSystemPrompt, TUTOR_QUICK_ACTIONS } from './tutor-prompt';

/** Cuántos mensajes previos se le mandan a la IA (costo y cuota de tokens). */
const HISTORY_WINDOW = 20;

/** El usuario autenticado tal como lo deja JwtStrategy en request.user. */
export interface TutorActor {
    id: string;
    role?: UserRole;
}

/** Lo que el controller emite por SSE mientras responde la IA. */
export type TutorStreamEvent =
    | { type: 'token'; text: string }
    | { type: 'done'; messageId: string };

/** Mensaje del alumno ya validado y guardado, listo para que responda la IA. */
export interface PreparedTutorTurn {
    conversation: Conversation;
    userMessage: Message;
    systemPrompt: string;
    history: AiChatMessage[];
}

@Injectable()
export class AiTutorService {
    private readonly logger = new Logger(AiTutorService.name);
    private readonly freeDailyLimit: number;

    constructor(
        @InjectRepository(Conversation)
        private readonly conversationsRepository: Repository<Conversation>,
        @InjectRepository(Message)
        private readonly messagesRepository: Repository<Message>,
        @InjectRepository(Lesson)
        private readonly lessonsRepository: Repository<Lesson>,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        private readonly subscriptionsService: SubscriptionsService,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
        @InjectRepository(LessonProgress)
        private readonly lessonProgressRepository: Repository<LessonProgress>,
        private readonly lessonsAccess: LessonsAccessService,
        @Inject(AI_PROVIDER)
        private readonly aiProvider: AiProvider,
        config: ConfigService,
    ) {
        this.freeDailyLimit = Number(config.get('AI_FREE_DAILY_LIMIT') ?? 20);
    }

    // --- Conversaciones ---

    /**
     * Última conversación del alumno en esta lección, con su historial.
     * `conversation: null` si nunca habló con el tutor acá (el front muestra el
     * chat vacío). Va envuelto porque un `null` suelto llega como body vacío y
     * rompe el `res.json()` del front.
     */
    async findLatestForLesson(lessonId: string, user: TutorActor): Promise<{ conversation: Conversation | null }> {
        await this.loadLessonWithAccess(lessonId, user);

        const latest = await this.conversationsRepository.findOne({
            where: { student: { id: user.id }, lesson: { id: lessonId } },
            order: { createdAt: 'DESC' },
        });
        return { conversation: latest ? await this.findOne(latest.id, user.id) : null };
    }

    /** Botón "Nueva conversación": la anterior queda guardada. */
    async createConversation(lessonId: string, user: TutorActor): Promise<Conversation> {
        const lesson = await this.loadLessonWithAccess(lessonId, user);

        const conversation = await this.conversationsRepository.save(
            this.conversationsRepository.create({ student: { id: user.id } as User, lesson }),
        );
        return { ...conversation, lesson: { id: lesson.id, title: lesson.title } as Lesson, messages: [] } as Conversation;
    }

    // PREGUNTAS TIPICAS
    getSuggestedQuestions(): string[] {
        return [
            '¿Me podés explicar este tema de forma más simple?',
            '¿Me darías un ejemplo práctico de esto?',
            '¿Cuáles son los puntos clave que tengo que recordar de esta lección?',
            'No entendí muy bien, ¿podrías darme un ejemplo para entenderlo mejor?',
        ];
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

        // No se devuelve la entidad User completa (email, etc.) al front.
        const { student: _student, ...rest } = conversation;
        return rest as Conversation;
    }

    async remove(id: string, userId: string): Promise<void> {
        await this.findOne(id, userId);
        // Borrado lógico: si se borraran los mensajes, el contador diario del
        // plan Free volvería atrás y "vaciar" regalaría mensajes.
        await this.conversationsRepository.softDelete(id);
    }

    // --- Mensajes ---

    /**
     * Todo lo que tiene que pasar ANTES de llamar a la IA: validar dueño,
     * acceso y cupo diario, guardar el mensaje del alumno y armar el prompt.
     * Si algo falla acá, el controller todavía puede responder un error HTTP
     * normal (no empezó el stream).
     */
    async prepareTurn(conversationId: string, dto: CreateMessageDto, user: TutorActor): Promise<PreparedTutorTurn> {
        const conversation = await this.findOne(conversationId, user.id);

        // Se re-chequea el acceso en cada mensaje: la inscripción o el plan
        // pudieron vencer desde que se abrió la conversación.
        const lesson = await this.loadLessonWithAccess(conversation.lesson.id, user);

        await this.assertUnderDailyLimit(user.id);

        if (!this.aiProvider.isConfigured()) {
            throw new HttpException('El tutor IA no está disponible en este momento', HttpStatus.SERVICE_UNAVAILABLE);
        }

        // Burbuja: se guarda el texto corto que ve el alumno, pero a la IA le
        // llega el pedido completo redactado en el servidor.
        const quickAction = dto.action ? TUTOR_QUICK_ACTIONS[dto.action] : null;
        const visibleText = quickAction ? quickAction.label : dto.content!.trim();
        const promptText = quickAction ? quickAction.prompt : visibleText;

        const userMessage = await this.messagesRepository.save(
            this.messagesRepository.create({
                conversation: { id: conversation.id } as Conversation,
                role: MessageRole.USER,
                content: visibleText,
            }),
        );

        const history: AiChatMessage[] = [
            ...conversation.messages.slice(-HISTORY_WINDOW).map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user', content: promptText },
        ];

        const systemPrompt = buildTutorSystemPrompt(await this.buildContext(lesson, user.id));

        return { conversation, userMessage, systemPrompt, history };
    }

    /**
     * Pide la respuesta a la IA y la va entregando en pedacitos. Al terminar
     * (o si el alumno corta a la mitad) guarda lo que se generó.
     */
    async *streamReply(turn: PreparedTutorTurn, signal: AbortSignal): AsyncIterable<TutorStreamEvent> {
        let fullText = '';
        try {
            for await (const text of this.aiProvider.streamReply({
                systemPrompt: turn.systemPrompt,
                history: turn.history,
                signal,
            })) {
                fullText += text;
                yield { type: 'token', text };
            }
        } finally {
            // Si se cortó sin generar nada, no se guarda un mensaje vacío.
            if (fullText.trim()) {
                const saved = await this.messagesRepository.save(
                    this.messagesRepository.create({
                        conversation: { id: turn.conversation.id } as Conversation,
                        role: MessageRole.ASSISTANT,
                        content: fullText,
                    }),
                );
                if (!signal.aborted) yield { type: 'done', messageId: saved.id };
            }
        }
    }

    // --- Uso del plan ---

    async getUsageToday(userId: string): Promise<{
        messagesUsedToday: number;
        dailyLimit: number | null; // null = ilimitado
        remaining: number | null;
    }> {
        const { startOfDay, endOfDay } = this.getTodayRange();

        // withDeleted: también cuentan los mensajes de conversaciones vaciadas.
        const messagesUsedToday = await this.messagesRepository.count({
            where: {
                role: MessageRole.USER,
                conversation: { student: { id: userId } },
                createdAt: Between(startOfDay, endOfDay),
            },
            withDeleted: true,
        });

        const isUnlimited = await this.hasUnlimitedUsage(userId);
        const dailyLimit = isUnlimited ? null : this.freeDailyLimit;
        const remaining = dailyLimit === null ? null : Math.max(dailyLimit - messagesUsedToday, 0);

        return { messagesUsedToday, dailyLimit, remaining };
    }

    // --- Métricas para el docente ---

    /**
     * "Lecciones donde más se pregunta": mensajes de alumnos al tutor
     * agrupados por lección. El docente ve sólo sus cursos; el admin, todos.
     */
    async getLessonStats(user: TutorActor, courseId?: string) {
        const qb = this.messagesRepository
            .createQueryBuilder('m')
            .innerJoin('m.conversation', 'conv')
            .innerJoin('conv.lesson', 'l')
            .innerJoin('l.module', 'mod')
            .innerJoin('mod.course', 'c')
            .innerJoin('conv.student', 's')
            // Las conversaciones que el alumno vació también fueron preguntas.
            .withDeleted()
            .select('l.id', 'lessonId')
            .addSelect('l.title', 'lessonTitle')
            .addSelect('mod.title', 'moduleTitle')
            .addSelect('c.id', 'courseId')
            .addSelect('c.title', 'courseTitle')
            .addSelect('COUNT(m.id)::int', 'questions')
            .addSelect('COUNT(DISTINCT s.id)::int', 'students')
            .where('m.role = :role', { role: MessageRole.USER })
            .groupBy('l.id')
            .addGroupBy('mod.id')
            .addGroupBy('c.id')
            .orderBy('questions', 'DESC')
            .limit(50);

        if (user.role !== UserRole.ADMIN) {
            qb.innerJoin('c.instructor', 'i').andWhere('i.id = :userId', { userId: user.id });
        }
        if (courseId) {
            qb.andWhere('c.id = :courseId', { courseId });
        }

        return qb.getRawMany<{
            lessonId: string;
            lessonTitle: string;
            moduleTitle: string;
            courseId: string;
            courseTitle: string;
            questions: number;
            students: number;
        }>();
    }

    // --- Helpers privados ---

    /**
     * Carga la lección con su contenido, módulo y curso, y corta con 403 si
     * el usuario no puede ver esa lección. Es la misma regla que usa el
     * reproductor de lecciones (LessonsAccessService): si no la podés ver,
     * tampoco podés preguntarle al tutor sobre ella.
     */
    private async loadLessonWithAccess(lessonId: string, user: TutorActor): Promise<Lesson> {
        const lesson = await this.lessonsRepository
            .createQueryBuilder('l')
            .addSelect('l.content') // `content` es select:false en la entidad
            .innerJoinAndSelect('l.module', 'mod')
            .innerJoinAndSelect('mod.course', 'c')
            .leftJoinAndSelect('c.instructor', 'i')
            .where('l.id = :lessonId', { lessonId })
            .getOne();

        if (!lesson || !lesson.isActive) {
            throw new NotFoundException(`Lección con id ${lessonId} no encontrada`);
        }

        const canAccess = await this.lessonsAccess.canAccessCourseContent(user, lesson.module.course, lesson);
        if (!canAccess) {
            throw new ForbiddenException('No tenés acceso a esta lección, así que tampoco al tutor IA sobre ella');
        }
        return lesson;
    }

    private async buildContext(lesson: Lesson, userId: string) {
        const course = lesson.module.course;

        const [student, lessonsInModule, lessonPosition, enrollment] = await Promise.all([
            this.usersRepository.findOne({ where: { id: userId }, select: { id: true, name: true } }),
            this.lessonsRepository.count({ where: { module: { id: lesson.module.id }, isActive: true } }),
            this.lessonsRepository
                .createQueryBuilder('l')
                .innerJoin('l.module', 'mod')
                .where('mod.id = :moduleId', { moduleId: lesson.module.id })
                .andWhere('l.isActive = true')
                .andWhere('l.order <= :order', { order: lesson.order })
                .getCount(),
            this.enrollmentsRepository.findOne({
                where: { student: { id: userId }, course: { id: course.id }, isActive: true },
            }),
        ]);

        const progress = enrollment
            ? await this.lessonProgressRepository.findOne({
                where: { enrollment: { id: enrollment.id }, lesson: { id: lesson.id } },
            })
            : null;

        return {
            // Sólo el primer nombre: no hace falta mandarle más datos personales a la IA.
            studentName: student?.name?.split(' ')[0] ?? 'alumno',
            courseTitle: course.title,
            courseLevel: course.difficulty,
            moduleTitle: lesson.module.title,
            lessonTitle: lesson.title,
            lessonPosition: Math.max(lessonPosition, 1),
            lessonsInModule: Math.max(lessonsInModule, 1),
            lessonContent: lesson.content,
            courseProgressPercent: enrollment ? enrollment.progressPercent : null,
            lessonCompleted: progress?.completed ?? false,
        };
    }

    private async assertUnderDailyLimit(userId: string): Promise<void> {
        const { messagesUsedToday, dailyLimit } = await this.getUsageToday(userId);

        if (dailyLimit !== null && messagesUsedToday >= dailyLimit) {
            // 429 + un código fijo para que el front muestre "pasate a Premium".
            throw new HttpException(
                {
                    statusCode: HttpStatus.TOO_MANY_REQUESTS,
                    code: 'AI_DAILY_LIMIT_REACHED',
                    message: `Alcanzaste el límite diario de ${dailyLimit} mensajes del plan gratuito. Pasate a Premium para uso ilimitado.`,
                    dailyLimit,
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    /**
     * Premium, docentes y admins: sin límite. Para el docente es su
     * beneficio del tutor. `hasActiveSubscription` ya contempla una
     * suscripción cancelada pero todavía dentro del período pago (ver
     * SubscriptionsService) — no se reimplementa esa regla acá.
     */
    private async hasUnlimitedUsage(userId: string): Promise<boolean> {
        const user = await this.usersRepository.findOne({ where: { id: userId }, select: { id: true, role: true } });
        if (user?.role === UserRole.TEACHER || user?.role === UserRole.ADMIN) return true;

        return this.subscriptionsService.hasActiveSubscription(userId);
    }

    private getTodayRange(): { startOfDay: Date; endOfDay: Date } {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return { startOfDay, endOfDay };
    }
}
