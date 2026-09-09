import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsService } from './lessons.service';
import { LessonsAccessService } from './lessons-access.service';
import { LessonsController } from './lessons.controller';
import { Lesson } from './entities/lesson.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';
import { CourseEnrollmentsModule } from '../course-enrollments/course-enrollments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lesson, CourseModuleEntity]),
    CourseEnrollmentsModule,
    SubscriptionsModule,
  ],
  controllers: [LessonsController],
  providers: [LessonsService, LessonsAccessService],
})
export class LessonsModule { }
