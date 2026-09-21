import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseProgressionService } from './course-progression.service';
import { CourseProgressionController } from './course-progression.controller';
import { Course } from '../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LessonProgress } from '../lesson-progress/entities/lesson-progress.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Quiz } from '../quizzes/entities/quiz.entity';
import { Question } from '../quizzes/entities/question.entity';
import { QuizAttempt } from '../quizzes/entities/quiz-attempt.entity';

/**
 * Progresión secuencial: qué módulo y qué checkpoint tiene desbloqueado cada
 * alumno.
 *
 * Trabaja con repositorios y no con los services de lecciones/quizzes a
 * propósito: LessonsModule y QuizzesModule lo importan a él, y depender de
 * ellos cerraría el círculo.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            Course,
            CourseModuleEntity,
            Lesson,
            LessonProgress,
            CourseEnrollment,
            Quiz,
            Question,
            QuizAttempt,
        ]),
    ],
    controllers: [CourseProgressionController],
    providers: [CourseProgressionService],
    exports: [CourseProgressionService],
})
export class CourseProgressionModule { }
