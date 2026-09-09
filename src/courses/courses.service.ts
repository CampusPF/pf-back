import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { User } from '../users/entities/user.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) { }

  async create(dto: CreateCourseDto, instructorId: string): Promise<Course> {
    const category = await this.categoriesRepository.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(`Categoría con id ${dto.categoryId} no encontrada`);
    }

    const instructor = await this.usersRepository.findOne({
      where: { id: instructorId },
    });
    if (!instructor) {
      throw new NotFoundException(`Instructor con id ${instructorId} no encontrado`);
    }

    const course = this.coursesRepository.create({
      title: dto.title,
      description: dto.description,
      difficulty: dto.difficulty,
      imageUrl: dto.imageUrl,
      priceInCents: dto.priceInCents ?? 0,
      currency: dto.currency ?? 'usd',
      category,
      instructor,
    });

    return this.coursesRepository.save(course);
  }

  async findAll(includeInactive = false): Promise<Course[]> {
    return this.coursesRepository.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { category: true, instructor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Course> {
    const course = await this.coursesRepository.findOne({
      where: { id },
      relations: { category: true, instructor: true, modules: true },
    });

    if (!course) {
      throw new NotFoundException(`Curso con id ${id} no encontrado`);
    }

    return course;
  }

  async update(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id);

    if (dto.categoryId) {
      const category = await this.categoriesRepository.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Categoría con id ${dto.categoryId} no encontrada`);
      }
      course.category = category;
    }

    Object.assign(course, {
      title: dto.title ?? course.title,
      description: dto.description ?? course.description,
      difficulty: dto.difficulty ?? course.difficulty,
      imageUrl: dto.imageUrl ?? course.imageUrl,
      priceInCents: dto.priceInCents ?? course.priceInCents,
      currency: dto.currency ?? course.currency,
    });

    return this.coursesRepository.save(course);
  }

  /**
   * Borrado lógico: un curso con inscripciones activas no se puede eliminar
   * físicamente sin romper el historial de esos estudiantes. Se marca
   * isActive:false para sacarlo del catálogo público sin perder datos.
   */
  async remove(id: string): Promise<Course> {
    const course = await this.findOne(id);
    course.isActive = false;
    return this.coursesRepository.save(course);
  }

  async restore(id: string): Promise<Course> {
    const course = await this.findOne(id);
    course.isActive = true;
    return this.coursesRepository.save(course);
  }
}