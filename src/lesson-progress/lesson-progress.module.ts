import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonProgressService } from './lesson-progress.service';
import { LessonProgressController } from './lesson-progress.controller';
import { LessonProgress } from './entities/lesson-progress.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { CourseProgressionModule } from '../course-progression/course-progression.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LessonProgress, CourseEnrollment, Lesson]),
    // No se reporta progreso sobre un módulo al que todavía no se llegó.
    CourseProgressionModule,
  ],
  controllers: [LessonProgressController],
  providers: [LessonProgressService],
})
export class LessonProgressModule { }