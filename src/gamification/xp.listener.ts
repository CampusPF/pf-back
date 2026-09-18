import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { EVENTS, LessonCompletedEvent, CourseCompletedEvent } from '../events';
import { XpService } from './xp.service';
import {
    DIFFICULTY_MULTIPLIER,
    XP_PER_LESSON,
    XP_COURSE_BASE,
    XP_COURSE_PER_LESSON,
} from './xp.config';

/**
 * Convierte los eventos de progreso en XP.
 *
 * Usa los repositorios de Course y Lesson en vez de CoursesService /
 * LessonsService: de esos services sólo hace falta un dato puntual (la
 * dificultad, un COUNT), y sus métodos `findOne` traen relaciones y aplican
 * reglas de acceso que acá no vienen al caso.
 */
@Injectable()
export class XpListener {
    private readonly logger = new Logger(XpListener.name);

    constructor(
        private readonly xpService: XpService,
        @InjectRepository(Course)
        private readonly coursesRepository: Repository<Course>,
        @InjectRepository(Lesson)
        private readonly lessonsRepository: Repository<Lesson>,
    ) { }

    @OnEvent(EVENTS.LESSON_COMPLETED)
    async onLessonCompleted(event: LessonCompletedEvent): Promise<void> {
        try {
            const multiplier = await this.multiplierForCourse(event.courseId);

            await this.xpService.addXp(
                event.userId,
                Math.round(XP_PER_LESSON * multiplier),
                `lesson_completed:${event.lessonId}`,
            );
        } catch (error) {
            // La lección ya quedó completada: ese es el hecho que le importa al
            // alumno. Que falle el XP no puede devolverle un error sobre una
            // operación que salió bien. Mismo criterio que el listener de racha.
            this.logError('sumar XP por la lección', event.userId, error);
        }
    }

    @OnEvent(EVENTS.COURSE_COMPLETED)
    async onCourseCompleted(event: CourseCompletedEvent): Promise<void> {
        try {
            const multiplier = await this.multiplierForCourse(event.courseId);
            const lessonCount = await this.countActiveLessons(event.courseId);
            const amount = Math.round(
                (XP_COURSE_BASE + XP_COURSE_PER_LESSON * lessonCount) * multiplier,
            );

            await this.xpService.addXp(
                event.userId,
                amount,
                `course_completed:${event.courseId}`,
            );
        } catch (error) {
            this.logError('sumar XP por el curso', event.userId, error);
        }
    }

    /**
     * La dificultad es del CURSO, no de la lección: el modelo no tiene
     * dificultad por lección. Si el curso no aparece, el multiplicador es 1 —
     * mejor dar el XP base que no dar nada.
     */
    private async multiplierForCourse(courseId: string): Promise<number> {
        const course = await this.coursesRepository.findOne({
            where: { id: courseId },
            select: { id: true, difficulty: true },
        });

        return course ? (DIFFICULTY_MULTIPLIER[course.difficulty] ?? 1) : 1;
    }

    /** Cuenta las lecciones vivas del curso con un COUNT, sin traerlas. */
    private async countActiveLessons(courseId: string): Promise<number> {
        return this.lessonsRepository
            .createQueryBuilder('lesson')
            .innerJoin('lesson.module', 'module')
            .where('module.course = :courseId', { courseId })
            .andWhere('lesson.isActive = true')
            .andWhere('module.isActive = true')
            .getCount();
    }

    private logError(action: string, userId: string, error: unknown): void {
        this.logger.error(
            `No se pudo ${action} del usuario ${userId}`,
            error instanceof Error ? error.stack : String(error),
        );
    }
}
