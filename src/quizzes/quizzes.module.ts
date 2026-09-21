import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quiz } from './entities/quiz.entity';
import { Question } from './entities/question.entity';
import { Option } from './entities/option.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { CourseProgressionModule } from '../course-progression/course-progression.module';

/**
 * Checkpoints: quizzes por módulo o de fin de curso.
 *
 * Exporta el service porque CertificatesModule lo usa para exigir todos los
 * checkpoints aprobados antes de emitir un certificado.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            Quiz,
            Question,
            Option,
            QuizAttempt,
            Course,
            CourseModuleEntity,
            CourseEnrollment,
        ]),
        // La progresión decide si el alumno llegó hasta este checkpoint.
        CourseProgressionModule,
    ],
    controllers: [QuizzesController],
    providers: [QuizzesService],
    exports: [QuizzesService],
})
export class QuizzesModule { }
