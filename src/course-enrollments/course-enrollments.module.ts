import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEnrollmentsService } from './course-enrollments.service';
import { CourseEnrollmentsController } from './course-enrollments.controller';
import { CourseEnrollment } from './entities/course-enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { User } from '../users/entities/user.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  // SubscriptionsModule: un suscriptor Premium puede inscribirse a cursos pagos.
  imports: [TypeOrmModule.forFeature([CourseEnrollment, Course, User]), SubscriptionsModule],
  controllers: [CourseEnrollmentsController],
  providers: [CourseEnrollmentsService],
  exports: [CourseEnrollmentsService],
})
export class CourseEnrollmentsModule { }