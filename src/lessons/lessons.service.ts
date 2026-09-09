import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from './entities/lesson.entity';
import { CourseModule as CourseModuleEntity } from '../course-modules/entities/course-module.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonsService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonsRepository: Repository<Lesson>,
    @InjectRepository(CourseModuleEntity)
    private readonly courseModulesRepository: Repository<CourseModuleEntity>,
  ) { }

  async create(dto: CreateLessonDto): Promise<Lesson> {
    const courseModule = await this.courseModulesRepository.findOne({
      where: { id: dto.moduleId },
    });
    if (!courseModule) {
      throw new NotFoundException(`Módulo con id ${dto.moduleId} no encontrado`);
    }

    let order = dto.order;
    if (order === undefined) {
      const lastLesson = await this.lessonsRepository.findOne({
        where: { module: { id: dto.moduleId } },
        order: { order: 'DESC' },
      });
      order = lastLesson ? lastLesson.order + 1 : 1;
    }

    const lesson = this.lessonsRepository.create({
      title: dto.title,
      order,
      module: courseModule,
    });

    return this.lessonsRepository.save(lesson);
  }

  /**
   * Vista de lista (catálogo / sidebar del curso): NUNCA incluye
   * content/videoUrl — son `select:false` en la entidad, así que no hace falta
   * pedir nada especial, pero se deja explícito el porqué: el contenido real
   * solo sale por findOne y solo con acceso.
   */
  async findAll(includeInactive = false): Promise<Lesson[]> {
    return this.lessonsRepository.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { module: true },
      order: { order: 'ASC' },
    });
  }

  async findAllByModule(moduleId: string, includeInactive = false): Promise<Lesson[]> {
    return this.lessonsRepository.find({
      where: includeInactive
        ? { module: { id: moduleId } }
        : { module: { id: moduleId }, isActive: true },
      order: { order: 'ASC' },
    });
  }

  /**
   * Único punto que trae content/videoUrl (vía addSelect, porque son
   * `select:false`). Incluye module.course para que el controller pueda
   * resolver el gate de acceso (course.priceInCents) sin una query aparte.
   */
  async findOne(id: string): Promise<Lesson> {
    const lesson = await this.lessonsRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.module', 'module')
      .leftJoinAndSelect('module.course', 'course')
      .addSelect(['lesson.content', 'lesson.videoUrl'])
      .where('lesson.id = :id', { id })
      .getOne();

    if (!lesson) {
      throw new NotFoundException(`Lección con id ${id} no encontrada`);
    }

    return lesson;
  }

  async update(id: string, dto: UpdateLessonDto): Promise<Lesson> {
    const lesson = await this.findOne(id);

    Object.assign(lesson, {
      title: dto.title ?? lesson.title,
      order: dto.order ?? lesson.order,
    });

    return this.lessonsRepository.save(lesson);
  }

  /**
   * Borrado lógico: si un estudiante ya tiene LessonProgress registrado para
   * esta lección, borrarla físicamente rompería ese historial. isActive:false
   * la saca del temario visible sin perder el progreso ya cursado.
   */
  async remove(id: string): Promise<Lesson> {
    const lesson = await this.findOne(id);
    lesson.isActive = false;
    return this.lessonsRepository.save(lesson);
  }

  async restore(id: string): Promise<Lesson> {
    const lesson = await this.findOne(id);
    lesson.isActive = true;
    return this.lessonsRepository.save(lesson);
  }
}