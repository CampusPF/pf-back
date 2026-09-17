import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseReview } from './entities/course-review.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseReviewsService } from './course-reviews.service';
import { CourseReviewsController } from './course-reviews.controller';
import { CourseEnrollmentsModule } from '../course-enrollments/course-enrollments.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Dueño de la tabla course_reviews y de sus reglas (quién puede reseñar).
 * Los agregados que muestra el catálogo (promedio, cantidad) los calcula
 * CourseStatsService en el módulo de cursos, leyendo esta tabla.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CourseReview, Course]),
    // hasActiveEnrollment: la regla "sólo inscriptos" es la misma que ya usa
    // el acceso a lecciones, no una segunda consulta armada a mano.
    CourseEnrollmentsModule,
    AuthModule,
  ],
  controllers: [CourseReviewsController],
  providers: [CourseReviewsService],
})
export class CourseReviewsModule { }
