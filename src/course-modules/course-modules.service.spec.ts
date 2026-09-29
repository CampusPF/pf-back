import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourseModulesService } from './course-modules.service';
import { CourseModule } from './entities/course-module.entity';
import { Course } from '../courses/entities/course.entity';

describe('CourseModulesService', () => {
  let service: CourseModulesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseModulesService,
        {
          provide: getRepositoryToken(CourseModule),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Course),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CourseModulesService>(CourseModulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
