import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsService } from './lessons.service';
import { LessonsAccessService } from './lessons-access.service';
import { LessonResourcesService } from './lesson-resources.service';
import { LessonsController } from './lessons.controller';
import { LessonResourcesController } from './lesson-resources.controller';
import { Lesson } from './entities/lesson.entity';
import { LessonResource } from './entities/lesson-resource.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';
import { CourseEnrollmentsModule } from '../course-enrollments/course-enrollments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FileUploadModule } from '../file-upload/file-upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lesson, LessonResource, CourseModuleEntity]),
    CourseEnrollmentsModule,
    SubscriptionsModule,
    FileUploadModule,
  ],
  controllers: [LessonsController, LessonResourcesController],
  providers: [LessonsService, LessonsAccessService, LessonResourcesService],
  // El gate se exporta para que otros módulos puedan aplicar la misma regla de
  // acceso al contenido sin reimplementarla.
  exports: [LessonsAccessService],
})
export class LessonsModule { }
