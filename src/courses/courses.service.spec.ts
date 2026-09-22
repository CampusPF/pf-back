import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CloudinaryService } from '../file-upload/cloudinary.service';
import { EVENTS } from '../events';

/**
 * Repo de cursos falso en memoria. Sólo implementa lo que usa
 * CoursesService.create / findAll / update: create, save, countBy({ slug }),
 * find, findOne({ where: { id } }).
 */
class FakeCourseRepo {
  private rows: Course[] = [];

  create(data: Partial<Course>): Course {
    return { id: `id-${this.rows.length + 1}`, ...data } as Course;
  }

  async save(course: Course): Promise<Course> {
    if (!this.rows.includes(course)) this.rows.push(course);
    return course;
  }

  async findOne({ where: { id } }: { where: { id: string } }): Promise<Course | null> {
    return this.rows.find((c) => c.id === id) ?? null;
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
  let eventEmitter: { emit: jest.Mock };

  const category = { id: 'cat-1', name: 'Programación' } as Category;
  const instructor = { id: 'user-1', name: 'Carlos' } as User;

  beforeEach(async () => {
    courseRepo = new FakeCourseRepo();
    eventEmitter = { emit: jest.fn() };

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
        { provide: CloudinaryService, useValue: {} },
        { provide: EventEmitter2, useValue: eventEmitter },
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

  describe('update — certificados', () => {
    const teacher = { id: instructor.id, role: UserRole.TEACHER };

    async function createCourse() {
      const course = await service.create({ ...baseDto } as any, instructor.id);
      course.instructor = instructor;
      return course;
    }

    it('renombrar el curso emite COURSE_RENAMED para regenerar los certificados', async () => {
      const course = await createCourse();

      await service.update(course.id, { title: 'React con Next.js' } as any, teacher);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.COURSE_RENAMED,
        expect.objectContaining({ courseId: course.id }),
      );
    });

    it('editar sin cambiar el título no emite nada', async () => {
      const course = await createCourse();

      await service.update(course.id, { title: baseDto.title, description: 'Otra' } as any, teacher);
      await service.update(course.id, { description: 'Sin título' } as any, teacher);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
