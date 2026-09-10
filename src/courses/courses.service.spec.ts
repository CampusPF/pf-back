import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { User } from '../users/entities/user.entity';

/**
 * Repo de cursos falso en memoria. Sólo implementa lo que usa
 * CoursesService.create / findAll: create, save, countBy({ slug }), find.
 */
class FakeCourseRepo {
  private rows: Course[] = [];

  create(data: Partial<Course>): Course {
    return { id: `id-${this.rows.length + 1}`, ...data } as Course;
  }

  async save(course: Course): Promise<Course> {
    this.rows.push(course);
    return course;
  }

  async countBy({ slug }: { slug: string }): Promise<number> {
    return this.rows.filter((c) => c.slug === slug).length;
  }

  async find(): Promise<Course[]> {
    return this.rows;
  }

  // helper para los tests
  bySlug(slug: string): Course | undefined {
    return this.rows.find((c) => c.slug === slug);
  }
}

describe('CoursesService (slug)', () => {
  let service: CoursesService;
  let courseRepo: FakeCourseRepo;

  const category = { id: 'cat-1', name: 'Programación' } as Category;
  const instructor = { id: 'user-1', name: 'Carlos' } as User;

  beforeEach(async () => {
    courseRepo = new FakeCourseRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: getRepositoryToken(Course), useValue: courseRepo },
        {
          provide: getRepositoryToken(Category),
          useValue: { findOne: jest.fn().mockResolvedValue(category) },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockResolvedValue(instructor) },
        },
      ],
    }).compile();

    service = module.get<CoursesService>(CoursesService);
  });

  const baseDto = {
    title: 'React Avanzado con TypeScript',
    categoryId: 'cat-1',
  };

  it('genera el slug a partir del título', async () => {
    const course = await service.create({ ...baseDto } as any, instructor.id);
    expect(course.slug).toBe('react-avanzado-con-typescript');
  });

  it('dos títulos iguales generan slugs distintos', async () => {
    const first = await service.create({ ...baseDto } as any, instructor.id);
    const second = await service.create({ ...baseDto } as any, instructor.id);

    expect(first.slug).toBe('react-avanzado-con-typescript');
    expect(second.slug).toBe('react-avanzado-con-typescript-2');
    expect(first.slug).not.toBe(second.slug);
  });

  it('buscar por slug encuentra el curso correcto', async () => {
    await service.create(
      { title: 'Introducción a NestJS', categoryId: 'cat-1' } as any,
      instructor.id,
    );
    await service.create(
      { title: 'Fundamentos de UX/UI', categoryId: 'cat-1' } as any,
      instructor.id,
    );

    const all = await courseRepo.find();
    const match = all.find((c) => c.slug === 'introduccion-a-nestjs');

    expect(match).toBeDefined();
    expect(match?.title).toBe('Introducción a NestJS');
  });

  it('respeta un slug explícito del dto pero lo slugifica igual', async () => {
    const course = await service.create(
      { ...baseDto, slug: 'React Cool!!' } as any,
      instructor.id,
    );
    expect(course.slug).toBe('react-cool');
  });
});
