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

  async findAll(): Promise<Lesson[]> {
    return this.lessonsRepository.find({
      relations: { module: true },
      order: { order: 'ASC' },
    });
  }

  async findAllByModule(moduleId: string): Promise<Lesson[]> {
    return this.lessonsRepository.find({
      where: { module: { id: moduleId } },
      order: { order: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Lesson> {
    const lesson = await this.lessonsRepository.findOne({
      where: { id },
      relations: { module: true },
    });

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

  async remove(id: string): Promise<void> {
    const lesson = await this.findOne(id);
    await this.lessonsRepository.remove(lesson);
  }
}