import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonProgress } from './entities/lesson-progress.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { UserRole } from '../users/entities/user.entity';
import { CreateLessonProgressDto } from './dto/create-lesson-progress.dto';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';

@Injectable()
export class LessonProgressService {
  constructor(
    @InjectRepository(LessonProgress)
    private readonly lessonProgressRepository: Repository<LessonProgress>,
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentsRepository: Repository<CourseEnrollment>,
    @InjectRepository(Lesson)
    private readonly lessonsRepository: Repository<Lesson>,
  ) { }

  async create(dto: CreateLessonProgressDto, userId: string): Promise<LessonProgress> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id: dto.enrollmentId },
      relations: { student: true },
    });
    if (!enrollment) {
      throw new NotFoundException(`Inscripción con id ${dto.enrollmentId} no encontrada`);
    }

    // Evita que un usuario reporte progreso sobre la inscripción de otro
    if (enrollment.student.id !== userId) {
      throw new ForbiddenException('Esta inscripción no te pertenece');
    }

    const lesson = await this.lessonsRepository.findOne({
      where: { id: dto.lessonId },
    });
    if (!lesson) {
      throw new NotFoundException(`Lección con id ${dto.lessonId} no encontrada`);
    }

    const existing = await this.lessonProgressRepository.findOne({
      where: { enrollment: { id: dto.enrollmentId }, lesson: { id: dto.lessonId } },
    });
    if (existing) {
      throw new ConflictException('Ya existe un registro de progreso para esta lección');
    }

    const completed = dto.completed ?? false;

    const progress = this.lessonProgressRepository.create({
      enrollment,
      lesson,
      completed,
      completedAt: completed ? new Date() : null,
    });

    return this.lessonProgressRepository.save(progress);
  }

  async findAll(): Promise<LessonProgress[]> {
    return this.lessonProgressRepository.find({
      relations: { enrollment: true, lesson: true },
    });
  }

  async findAllByEnrollment(enrollmentId: string): Promise<LessonProgress[]> {
    return this.lessonProgressRepository.find({
      where: { enrollment: { id: enrollmentId } },
      relations: { lesson: true },
    });
  }

  /**
   * Todo el progreso del usuario del token, en todas sus inscripciones.
   * Se filtra por el id del JWT, no por ningún id que mande el cliente.
   */
  async findAllByUser(userId: string): Promise<LessonProgress[]> {
    return this.lessonProgressRepository.find({
      where: { enrollment: { student: { id: userId } } },
      relations: { lesson: true, enrollment: { course: true } },
    });
  }

  async findOne(id: string): Promise<LessonProgress> {
    const progress = await this.lessonProgressRepository.findOne({
      where: { id },
      relations: { enrollment: { student: true }, lesson: true },
    });

    if (!progress) {
      throw new NotFoundException(`Registro de progreso con id ${id} no encontrado`);
    }

    return progress;
  }

  /**
   * Lectura con control de titularidad: un alumno solo puede leer SU progreso.
   * Un ADMIN puede leer el de cualquiera (operación de administración).
   */
  async findOneForUser(
    id: string,
    user: { id: string; role: UserRole },
  ): Promise<LessonProgress> {
    const progress = await this.findOne(id);
    this.assertOwnerOrAdmin(progress, user);
    return progress;
  }

  async update(id: string, dto: UpdateLessonProgressDto, userId: string): Promise<LessonProgress> {
    const progress = await this.findOne(id);

    // Editar progreso es siempre del dueño, ni siquiera el admin lo hace por
    // el alumno: no hay caso de negocio para eso.
    if (progress.enrollment.student.id !== userId) {
      throw new ForbiddenException('Esta inscripción no te pertenece');
    }

    const completed = dto.completed ?? progress.completed;

    Object.assign(progress, {
      completed,
      completedAt: completed ? (progress.completedAt ?? new Date()) : null,
    });

    return this.lessonProgressRepository.save(progress);
  }

  async remove(id: string, user: { id: string; role: UserRole }): Promise<void> {
    const progress = await this.findOne(id);
    this.assertOwnerOrAdmin(progress, user);
    await this.lessonProgressRepository.remove(progress);
  }

  /**
   * Titularidad del recurso: el progreso pertenece al alumno de la inscripción.
   * El rol de ADMIN es la única excepción, y es deliberada.
   */
  private assertOwnerOrAdmin(
    progress: LessonProgress,
    user: { id: string; role: UserRole },
  ): void {
    if (user?.role === UserRole.ADMIN) return;
    if (progress.enrollment?.student?.id !== user?.id) {
      throw new ForbiddenException('Este registro de progreso no te pertenece');
    }
  }
}