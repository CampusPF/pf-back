import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, FindOptionsRelations, FindOptionsWhere, Repository } from 'typeorm';
import { ForumThread } from './entities/forum-thread.entity';
import { ForumPost } from './entities/forum-post.entity';
import { ForumCategory } from './entities/forum-category.entity';
import { Course } from '../courses/entities/course.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ForumAccessService } from './forum-access.service';
import { ModerationService } from '../moderation/moderation.service';
import { AccessActor } from '../lessons/lessons-access.service';
import {
    CreateForumPostDto,
    CreateForumThreadDto,
    UpdateForumPostDto,
    UpdateForumThreadDto,
} from './dto/forum-thread.dto';
import { ModerateForumThreadDto } from './dto/forum-moderation.dto';
import { FORUM_PAGE_SIZE } from './forum.constants';
import {
    EVENTS,
    ForumReplyCreatedEvent,
    ForumSolutionMarkedEvent,
    ForumThreadCreatedEvent,
} from '../events';

export interface ForumAuthorView {
    id: string;
    name: string;
    avatarUrl: string | null;
    role: UserRole;
    /** Es el docente que dicta el curso del hilo. Para mostrar el badge. */
    isCourseInstructor: boolean;
}

export interface ForumThreadView {
    id: string;
    title: string;
    body: string;
    isPinned: boolean;
    isLocked: boolean;
    replyCount: number;
    solutionPostId: string | null;
    lastActivityAt: Date;
    createdAt: Date;
    updatedAt: Date;
    course: { id: string; title: string; slug: string } | null;
    category: { id: string; name: string; slug: string } | null;
    author: ForumAuthorView;
}

export interface ForumThreadDetail extends ForumThreadView {
    permissions: { canModerate: boolean; canEdit: boolean; canReply: boolean };
}

export interface ForumPostView {
    id: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    editedAt: Date | null;
    isSolution: boolean;
    author: ForumAuthorView;
}

export interface ForumPage<T> {
    data: T[];
    meta: { total: number; page: number; limit: number; totalPages: number };
}

export type ForumActivityView = ForumThreadView;

const THREAD_RELATIONS: FindOptionsRelations<ForumThread> = {
    author: true,
    course: { instructor: true },
    category: true,
};

/** Un hilo de curso sólo se abre si el curso existe y está activo. */
const ACTIVE_COURSE_MISSING = 'Curso no encontrado.';

/**
 * Foros de curso y generales: hilos, respuestas y moderación.
 *
 * Orden de validaciones en cada escritura: primero quién es y si puede
 * (403/404), después el texto (422 por moderación). Así no se gasta una
 * llamada a la IA con quien no tiene permiso.
 */
@Injectable()
export class ForumsService {
    constructor(
        @InjectRepository(ForumThread)
        private readonly threadsRepository: Repository<ForumThread>,
        @InjectRepository(ForumPost)
        private readonly postsRepository: Repository<ForumPost>,
        @InjectRepository(ForumCategory)
        private readonly categoriesRepository: Repository<ForumCategory>,
        @InjectRepository(Course)
        private readonly coursesRepository: Repository<Course>,
        private readonly access: ForumAccessService,
        private readonly moderation: ModerationService,
        private readonly events: EventEmitter2,
        private readonly dataSource: DataSource,
    ) { }

    // ---------- Hilos de curso ----------

    async listCourseThreads(user: AccessActor, courseId: string, page = 1, limit = FORUM_PAGE_SIZE) {
        const course = await this.getActiveCourse(courseId);
        await this.assertCanUseCourse(user, course);
        return this.paginateThreads({ courseId }, page, limit);
    }

    async createCourseThread(user: AccessActor, courseId: string, dto: CreateForumThreadDto): Promise<ForumThreadView> {
        const course = await this.getActiveCourse(courseId);
        await this.assertCanUseCourse(user, course);

        await this.moderation.assertPublishable(`${dto.title}\n${dto.body}`);

        const now = new Date();
        const saved = await this.threadsRepository.save(
            this.threadsRepository.create({
                courseId,
                authorId: user.id,
                title: dto.title.trim(),
                body: dto.body.trim(),
                lastActivityAt: now,
            }),
        );

        this.events.emit(
            EVENTS.FORUM_THREAD_CREATED,
            new ForumThreadCreatedEvent(
                saved.id,
                saved.title,
                course.id,
                course.title,
                course.instructor?.id ?? null,
                user.id,
            ),
        );

        return toThreadView(await this.loadThread(saved.id));
    }

    // ---------- Foro general ----------

    listCategories(): Promise<ForumCategory[]> {
        return this.categoriesRepository.find({
            where: { isActive: true },
            order: { position: 'ASC', name: 'ASC' },
        });
    }

    async listCategoryThreads(categoryId: string, page = 1, limit = FORUM_PAGE_SIZE) {
        await this.getActiveCategory(categoryId);
        return this.paginateThreads({ categoryId }, page, limit);
    }

    async createCategoryThread(user: AccessActor, categoryId: string, dto: CreateForumThreadDto): Promise<ForumThreadView> {
        await this.getActiveCategory(categoryId);

        await this.moderation.assertPublishable(`${dto.title}\n${dto.body}`);

        const saved = await this.threadsRepository.save(
            this.threadsRepository.create({
                categoryId,
                authorId: user.id,
                title: dto.title.trim(),
                body: dto.body.trim(),
                lastActivityAt: new Date(),
            }),
        );
        return toThreadView(await this.loadThread(saved.id));
    }

    // ---------- Hilo ----------

    async getThread(user: AccessActor, threadId: string): Promise<ForumThreadDetail> {
        const thread = await this.loadThread(threadId);
        await this.assertCanRead(user, thread);

        const canModerate = this.access.canModerate(user, thread);
        const isAuthor = thread.authorId === user.id;
        return {
            ...toThreadView(thread),
            permissions: {
                canModerate,
                canEdit: canModerate || isAuthor,
                canReply: !thread.isLocked || canModerate,
            },
        };
    }

    async updateThread(user: AccessActor, threadId: string, dto: UpdateForumThreadDto): Promise<ForumThreadView> {
        const thread = await this.loadThread(threadId);
        await this.assertCanRead(user, thread);
        const canModerate = this.access.canModerate(user, thread);
        this.assertCanEdit(user, thread, canModerate);

        const title = dto.title?.trim() ?? thread.title;
        const body = dto.body?.trim() ?? thread.body;
        if (dto.title !== undefined || dto.body !== undefined) {
            await this.moderation.assertPublishable(`${title}\n${body}`);
        }

        await this.threadsRepository.update(threadId, { title, body });
        return toThreadView(await this.loadThread(threadId));
    }

    async deleteThread(user: AccessActor, threadId: string): Promise<void> {
        const thread = await this.loadThread(threadId);
        await this.assertCanRead(user, thread);
        const canModerate = this.access.canModerate(user, thread);
        if (!canModerate && thread.authorId !== user.id) {
            throw new ForbiddenException('Solo el autor o un moderador puede borrar este hilo.');
        }
        // Borrado lógico (deletedAt): el hilo deja de aparecer en todas las listas.
        await this.threadsRepository.softDelete(threadId);
    }

    /** Fijar y cerrar: sólo moderadores (admin o docente dueño del curso). */
    async moderateThread(user: AccessActor, threadId: string, dto: ModerateForumThreadDto): Promise<ForumThreadView> {
        const thread = await this.loadThread(threadId);
        if (!this.access.canModerate(user, thread)) {
            throw new ForbiddenException('Solo el docente del curso o un administrador puede moderar este hilo.');
        }
        const changes: Partial<Pick<ForumThread, 'isPinned' | 'isLocked'>> = {};
        if (dto.isPinned !== undefined) changes.isPinned = dto.isPinned;
        if (dto.isLocked !== undefined) changes.isLocked = dto.isLocked;
        if (Object.keys(changes).length) await this.threadsRepository.update(threadId, changes);
        return toThreadView(await this.loadThread(threadId));
    }

    async setSolution(user: AccessActor, threadId: string, postId: string): Promise<ForumThreadView> {
        const thread = await this.loadThread(threadId);
        await this.assertCanRead(user, thread);
        const canModerate = this.access.canModerate(user, thread);
        if (!canModerate && thread.authorId !== user.id) {
            throw new ForbiddenException('Solo el autor del hilo o un moderador puede marcar una solución.');
        }

        const post = await this.postsRepository.findOne({ where: { id: postId, threadId } });
        if (!post) throw new NotFoundException('La respuesta no pertenece a este hilo.');

        await this.threadsRepository.update(threadId, { solutionPostId: postId });

        // Avisa a quien escribió la solución, salvo que sea quien la marcó.
        if (post.authorId !== user.id) {
            this.events.emit(
                EVENTS.FORUM_SOLUTION_MARKED,
                new ForumSolutionMarkedEvent(thread.id, thread.title, postId, post.authorId, user.id),
            );
        }
        return toThreadView(await this.loadThread(threadId));
    }

    async clearSolution(user: AccessActor, threadId: string): Promise<ForumThreadView> {
        const thread = await this.loadThread(threadId);
        await this.assertCanRead(user, thread);
        const canModerate = this.access.canModerate(user, thread);
        if (!canModerate && thread.authorId !== user.id) {
            throw new ForbiddenException('Solo el autor del hilo o un moderador puede quitar la solución.');
        }
        await this.threadsRepository.update(threadId, { solutionPostId: null });
        return toThreadView(await this.loadThread(threadId));
    }

    // ---------- Respuestas ----------

    async listPosts(user: AccessActor, threadId: string, page = 1, limit = FORUM_PAGE_SIZE): Promise<ForumPage<ForumPostView>> {
        const thread = await this.loadThread(threadId);
        await this.assertCanRead(user, thread);

        const [posts, total] = await this.postsRepository.findAndCount({
            where: { threadId },
            relations: { author: true, thread: { course: { instructor: true } } },
            order: { createdAt: 'ASC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            data: posts.map((post) => toPostView(post, thread)),
            meta: buildMeta(total, page, limit),
        };
    }

    async createPost(user: AccessActor, threadId: string, dto: CreateForumPostDto): Promise<ForumPostView> {
        const thread = await this.loadThread(threadId);
        await this.assertCanRead(user, thread);
        const canModerate = this.access.canModerate(user, thread);
        if (thread.isLocked && !canModerate) {
            throw new ForbiddenException('El hilo está cerrado y ya no admite respuestas.');
        }

        await this.moderation.assertPublishable(dto.body);

        // Quienes ya participaban (autor del hilo y respondedores previos) son
        // los destinatarios del aviso. Se calcula antes de insertar la nueva.
        const previous = await this.postsRepository.find({
            where: { threadId },
            select: { authorId: true },
        });
        const recipientIds = [...new Set([thread.authorId, ...previous.map((p) => p.authorId)])];

        const saved = await this.dataSource.transaction(async (manager) => {
            const postRepo = manager.getRepository(ForumPost);
            const post = await postRepo.save(
                postRepo.create({ threadId, authorId: user.id, body: dto.body.trim() }),
            );
            await manager.getRepository(ForumThread).update(threadId, {
                replyCount: () => '"reply_count" + 1',
                lastActivityAt: new Date(),
            });
            return post;
        });

        this.events.emit(
            EVENTS.FORUM_REPLY_CREATED,
            new ForumReplyCreatedEvent(thread.id, thread.title, saved.id, user.id, recipientIds),
        );

        const reloaded = await this.postsRepository.findOneOrFail({
            where: { id: saved.id },
            relations: { author: true, thread: { course: { instructor: true } } },
        });
        return toPostView(reloaded, thread);
    }

    async updatePost(user: AccessActor, postId: string, dto: UpdateForumPostDto): Promise<ForumPostView> {
        const post = await this.loadPost(postId);
        const thread = post.thread;
        await this.assertCanRead(user, thread);
        const canModerate = this.access.canModerate(user, thread);
        if (post.authorId !== user.id && !canModerate) {
            throw new ForbiddenException('Solo el autor o un moderador puede editar esta respuesta.');
        }
        if (thread.isLocked && !canModerate) {
            throw new ForbiddenException('El hilo está cerrado: no se pueden editar sus respuestas.');
        }

        await this.moderation.assertPublishable(dto.body);

        await this.postsRepository.update(postId, { body: dto.body.trim(), editedAt: new Date() });
        return toPostView(await this.loadPost(postId), thread);
    }

    async deletePost(user: AccessActor, postId: string): Promise<void> {
        const post = await this.loadPost(postId);
        const thread = post.thread;
        await this.assertCanRead(user, thread);
        const canModerate = this.access.canModerate(user, thread);
        if (post.authorId !== user.id && !canModerate) {
            throw new ForbiddenException('Solo el autor o un moderador puede borrar esta respuesta.');
        }
        if (thread.isLocked && !canModerate) {
            throw new ForbiddenException('El hilo está cerrado: no se pueden borrar sus respuestas.');
        }

        // Si era la solución, el FK la deja en null (ON DELETE SET NULL).
        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(ForumPost).delete(postId);
            await manager.getRepository(ForumThread).update(thread.id, {
                replyCount: () => 'GREATEST("reply_count" - 1, 0)',
            });
        });
    }

    // ---------- Mis foros ----------

    /**
     * Actividad reciente relevante para el usuario: hilos de sus cursos
     * (inscripto o docente) y hilos donde escribió. Máximo 30, más nuevos primero.
     */
    async myActivity(user: AccessActor): Promise<ForumActivityView[]> {
        const threads = await this.threadsRepository
            .createQueryBuilder('thread')
            .leftJoinAndSelect('thread.author', 'author')
            .leftJoinAndSelect('thread.course', 'course')
            .leftJoinAndSelect('course.instructor', 'instructor')
            .leftJoinAndSelect('thread.category', 'category')
            .where('thread.deletedAt IS NULL')
            .andWhere(
                `(thread.authorId = :userId
                  OR thread.id IN (SELECT p.thread_id FROM forum_posts p WHERE p.author_id = :userId)
                  OR thread.courseId IN (SELECT e."courseId" FROM course_enrollments e WHERE e."studentId" = :userId AND e."isActive" = true)
                  OR thread.courseId IN (SELECT c.id FROM courses c WHERE c."instructorId" = :userId))`,
                { userId: user.id },
            )
            .orderBy('thread.lastActivityAt', 'DESC')
            .take(30)
            .getMany();

        return threads.map(toThreadView);
    }

    // ---------- Helpers ----------

    private async paginateThreads(where: FindOptionsWhere<ForumThread>, page: number, limit: number): Promise<ForumPage<ForumThreadView>> {
        const [threads, total] = await this.threadsRepository.findAndCount({
            where,
            relations: THREAD_RELATIONS,
            order: { isPinned: 'DESC', lastActivityAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { data: threads.map(toThreadView), meta: buildMeta(total, page, limit) };
    }

    private async getActiveCourse(courseId: string): Promise<Course> {
        const course = await this.coursesRepository.findOne({
            where: { id: courseId, isActive: true },
            relations: { instructor: true },
        });
        if (!course) throw new NotFoundException(ACTIVE_COURSE_MISSING);
        return course;
    }

    private async getActiveCategory(categoryId: string): Promise<ForumCategory> {
        const category = await this.categoriesRepository.findOne({ where: { id: categoryId, isActive: true } });
        if (!category) throw new NotFoundException('Categoría no encontrada.');
        return category;
    }

    private async assertCanUseCourse(user: AccessActor, course: Course): Promise<void> {
        if (!(await this.access.canUseCourseForum(user, course))) {
            throw new ForbiddenException('Necesitás estar inscripto al curso para participar de su foro.');
        }
    }

    private async assertCanRead(user: AccessActor, thread: ForumThread): Promise<void> {
        if (!(await this.access.canRead(user, thread))) {
            throw new ForbiddenException('No tenés acceso a este foro.');
        }
    }

    private assertCanEdit(user: AccessActor, thread: ForumThread, canModerate: boolean): void {
        if (thread.authorId !== user.id && !canModerate) {
            throw new ForbiddenException('Solo el autor o un moderador puede editar este hilo.');
        }
        if (thread.isLocked && !canModerate) {
            throw new ForbiddenException('El hilo está cerrado y no se puede editar.');
        }
    }

    private async loadThread(threadId: string): Promise<ForumThread> {
        const thread = await this.threadsRepository.findOne({
            where: { id: threadId },
            relations: THREAD_RELATIONS,
        });
        if (!thread) throw new NotFoundException('Hilo no encontrado.');
        return thread;
    }

    private async loadPost(postId: string): Promise<ForumPost & { thread: ForumThread }> {
        const post = await this.postsRepository.findOne({
            where: { id: postId },
            relations: { thread: THREAD_RELATIONS as FindOptionsRelations<ForumThread> },
        });
        if (!post?.thread) throw new NotFoundException('Respuesta no encontrada.');
        return post as ForumPost & { thread: ForumThread };
    }
}

function buildMeta(total: number, page: number, limit: number) {
    return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function toAuthor(user: User, instructorId: string | null): ForumAuthorView {
    return {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl ?? null,
        role: user.role,
        isCourseInstructor: !!instructorId && instructorId === user.id,
    };
}

export function toThreadView(thread: ForumThread): ForumThreadView {
    const instructorId = thread.course?.instructor?.id ?? null;
    return {
        id: thread.id,
        title: thread.title,
        body: thread.body,
        isPinned: thread.isPinned,
        isLocked: thread.isLocked,
        replyCount: thread.replyCount,
        solutionPostId: thread.solutionPostId,
        lastActivityAt: thread.lastActivityAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        course: thread.course ? { id: thread.course.id, title: thread.course.title, slug: thread.course.slug } : null,
        category: thread.category ? { id: thread.category.id, name: thread.category.name, slug: thread.category.slug } : null,
        author: toAuthor(thread.author, instructorId),
    };
}

function toPostView(post: ForumPost, thread: ForumThread): ForumPostView {
    const instructorId = thread.course?.instructor?.id ?? null;
    return {
        id: post.id,
        body: post.body,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        editedAt: post.editedAt,
        isSolution: thread.solutionPostId === post.id,
        author: toAuthor(post.author, instructorId),
    };
}
