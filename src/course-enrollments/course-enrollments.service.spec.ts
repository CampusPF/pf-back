import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CourseEnrollmentsService } from './course-enrollments.service';
import { CourseEnrollment } from './entities/course-enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { User } from '../users/entities/user.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

describe('CourseEnrollmentsService', () => {
  let service: CourseEnrollmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseEnrollmentsService,
        {
          provide: getRepositoryToken(CourseEnrollment),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Course),
          useValue: {},
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: SubscriptionsService,
          useValue: {},
        },
        {
          provide: EventEmitter2,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CourseEnrollmentsService>(CourseEnrollmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
