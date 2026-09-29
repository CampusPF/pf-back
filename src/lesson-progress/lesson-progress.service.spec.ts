import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LessonProgressService } from './lesson-progress.service';
import { LessonProgress } from './entities/lesson-progress.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { CourseProgressionService } from '../course-progression/course-progression.service';

describe('LessonProgressService', () => {
  let service: LessonProgressService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonProgressService,
        {
          provide: getRepositoryToken(LessonProgress),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CourseEnrollment),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Lesson),
          useValue: {},
        },
        {
          provide: EventEmitter2,
          useValue: {},
        },
        {
          provide: CourseProgressionService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<LessonProgressService>(LessonProgressService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
