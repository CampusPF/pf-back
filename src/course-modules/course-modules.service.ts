import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseModule as CourseModuleEntity } from './entities/course-module.entity';
import { Course } from '../courses/entities/course.entity';
import { CreateCourseModuleDto } from './dto/create-course-module.dto';
import { UpdateCourseModuleDto } from './dto/update-course-module.dto';
import { Actor, assertCourseOwner } from '../common/utils/assert-course-owner.util';

@Injectable()
export class CourseModulesService {
  constructor(
    @InjectRepository(CourseModuleEntity)
    private readonly courseModulesRepository: Repository<CourseModuleEntity>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
  ) { }

  async create(dto: CreateCourseModuleDto, actor: Actor): Promise<CourseModuleEntity> {
    const course = await this.coursesRepository.findOne({
      where: { id: dto.courseId },
      relations: { instructor: true },
    });
    if (!course) {
      throw new NotFoundException(`Curso con id ${dto.courseId} no encontrado`);
    }
    assertCourseOwner(course, actor);

    let order = dto.order;
    if (order === undefined) {
      const lastModule = await this.courseModulesRepository.findOne({
        where: { course: { id: dto.courseId } },
        order: { order: 'DESC' },
      });
      order = lastModule ? lastModule.order + 1 : 1;
    }

    const courseModule = this.courseModulesRepository.create({
      title: dto.title,
      order,
      course,
    });

    return this.courseModulesRepository.save(courseModule);
  }

  async findAll(includeInactive = false): Promise<CourseModuleEntity[]> {
    return this.courseModulesRepository.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { course: true },
      order: { order: 'ASC' },
    });
  }

  async findAllByCourse(courseId: string): Promise<CourseModuleEntity[]> {
    return this.courseModulesRepository.find({
      where: { course: { id: courseId } },
      relations: { lessons: true },
      order: { order: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CourseModuleEntity> {
    const courseModule = await this.courseModulesRepository.findOne({
      where: { id },
      // course.instructor: lo necesita assertCourseOwner en update/remove/restore.
      relations: { course: { instructor: true }, lessons: true },
    });

    if (!courseModule) {
      throw new NotFoundException(`Módulo con id ${id} no encontrado`);
    }

    return courseModule;
  }

  async update(
    id: string,
    dto: UpdateCourseModuleDto,
    actor: Actor,
  ): Promise<CourseModuleEntity> {
    const courseModule = await this.findOne(id);
    assertCourseOwner(courseModule.course, actor);

    Object.assign(courseModule, {
      title: dto.title ?? courseModule.title,
      order: dto.order ?? courseModule.order,
    });

    return this.courseModulesRepository.save(courseModule);
  }

  /**
   * Borrado lógico: un módulo con lecciones ya cursadas por estudiantes no
   * debería desaparecer del historial. isActive:false lo saca del temario
   * visible sin perder el registro de LessonProgress asociado.
   */
  async remove(id: string, actor: Actor): Promise<CourseModuleEntity> {
    const courseModule = await this.findOne(id);
    assertCourseOwner(courseModule.course, actor);
    courseModule.isActive = false;
    return this.courseModulesRepository.save(courseModule);
  }

  async restore(id: string, actor: Actor): Promise<CourseModuleEntity> {
    const courseModule = await this.findOne(id);
    assertCourseOwner(courseModule.course, actor);
    courseModule.isActive = true;
    return this.courseModulesRepository.save(courseModule);
  }
}