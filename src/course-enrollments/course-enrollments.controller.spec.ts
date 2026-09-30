import { Test, TestingModule } from '@nestjs/testing';
import { CourseEnrollmentsController } from './course-enrollments.controller';
import { CourseEnrollmentsService } from './course-enrollments.service';

describe('CourseEnrollmentsController', () => {
  let controller: CourseEnrollmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseEnrollmentsController],
      providers: [
        {
          provide: CourseEnrollmentsService,
          useValue: {},
        }
      ],
    }).compile();

    controller = module.get<CourseEnrollmentsController>(CourseEnrollmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
