import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { Course } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { CourseStatsService } from './course-stats.service';
import { CourseReview } from '../course-reviews/entities/course-review.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';

@Module({
  imports: [
    // CourseReview y CourseEnrollment: sólo lectura, para los agregados del
    // catálogo (CourseStatsService).
    TypeOrmModule.forFeature([Course, Category, User, CourseReview, CourseEnrollment]),
    AuthModule,
    FileUploadModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService, CourseStatsService],
})
export class CoursesModule { }