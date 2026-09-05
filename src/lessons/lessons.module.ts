import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { Lesson } from './entities/lesson.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lesson, CourseModuleEntity])],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule { }