import { Test, TestingModule } from '@nestjs/testing';
import { CourseModulesController } from './course-modules.controller';
import { CourseModulesService } from './course-modules.service';

describe('CourseModulesController', () => {
  let controller: CourseModulesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseModulesController],
      providers: [
        {
          provide: CourseModulesService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<CourseModulesController>(CourseModulesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
