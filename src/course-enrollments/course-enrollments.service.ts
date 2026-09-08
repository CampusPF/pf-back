import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEnrollment } from './entities/course-enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateCourseEnrollmentDto } from './dto/create-course-enrollment.dto';
import { UpdateCourseEnrollmentDto } from './dto/update-course-enrollment.dto';

@Injectable()
export class CourseEnrollmentsService {
  constructor(
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentsRepository: Repository<CourseEnrollment>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) { }

  /**
   * Si ya existe una inscripción CANCELADA (isActive:false) para este mismo
   * alumno+curso, la reactivamos en vez de crear una fila nueva — la
   * restricción @Unique(['student','course']) no permite dos filas para el
   * mismo par, sin importar el estado.
   */
  async create(dto: CreateCourseEnrollmentDto, studentId: string): Promise<CourseEnrollment> {
    const course = await this.coursesRepository.findOne({
      where: { id: dto.courseId },
    });
    if (!course) {
      throw new NotFoundException(`Curso con id ${dto.courseId} no encontrado`);
    }

    const student = await this.usersRepository.findOne({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Usuario con id ${studentId} no encontrado`);
    }

    const existing = await this.enrollmentsRepository.findOne({
      where: { student: { id: studentId }, course: { id: dto.courseId } },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('Ya estás inscripto en este curso');
      }
      // Reactivar la inscripción cancelada en vez de duplicar la fila
      existing.isActive = true;
      return this.enrollmentsRepository.save(existing);
    }

    const enrollment = this.enrollmentsRepository.create({ student, course });
    return this.enrollmentsRepository.save(enrollment);
  }

  async findAll(includeInactive = false): Promise<CourseEnrollment[]> {
    return this.enrollmentsRepository.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { student: true, course: true },
      order: { enrolledAt: 'DESC' },
    });
  }

  async findAllByStudent(studentId: string, includeInactive = false): Promise<CourseEnrollment[]> {
    return this.enrollmentsRepository.find({
      where: includeInactive
        ? { student: { id: studentId } }
        : { student: { id: studentId }, isActive: true },
      relations: { course: true },
      order: { enrolledAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<CourseEnrollment> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id },
      relations: { student: true, course: true, lessonProgress: true },
    });

    if (!enrollment) {
      throw new NotFoundException(`Inscripción con id ${id} no encontrada`);
    }

    return enrollment;
  }

  /**
   * Lectura con control de titularidad: un alumno solo puede leer SU
   * inscripción. Un ADMIN puede leer cualquiera (operación de administración).
   */
  async findOneForUser(
    id: string,
    user: { id: string; role: UserRole },
  ): Promise<CourseEnrollment> {
    const enrollment = await this.findOne(id);
    this.assertOwnerOrAdmin(enrollment, user);
    return enrollment;
  }

  async update(
    id: string,
    dto: UpdateCourseEnrollmentDto,
    user: { id: string; role: UserRole },
  ): Promise<CourseEnrollment> {
    const enrollment = await this.findOne(id);
    this.assertOwnerOrAdmin(enrollment, user);

    Object.assign(enrollment, {
      progressPercent: dto.progressPercent ?? enrollment.progressPercent,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : enrollment.completedAt,
    });

    return this.enrollmentsRepository.save(enrollment);
  }

  /**
   * Cancelar es un borrado lógico: LessonProgress de esta inscripción no se
   * pierde. isActive:false la saca de "mis inscripciones activas" pero el
   * historial de qué llegó a cursar el alumno se conserva.
   */
  async remove(
    id: string,
    user: { id: string; role: UserRole },
  ): Promise<CourseEnrollment> {
    const enrollment = await this.findOne(id);
    this.assertOwnerOrAdmin(enrollment, user);
    enrollment.isActive = false;
    return this.enrollmentsRepository.save(enrollment);
  }

  async restore(
    id: string,
    user: { id: string; role: UserRole },
  ): Promise<CourseEnrollment> {
    const enrollment = await this.findOne(id);
    this.assertOwnerOrAdmin(enrollment, user);
    enrollment.isActive = true;
    return this.enrollmentsRepository.save(enrollment);
  }

  /**
   * Titularidad del recurso: la inscripción pertenece a su alumno.
   * El rol de ADMIN es la única excepción, y es deliberada.
   */
  private assertOwnerOrAdmin(
    enrollment: CourseEnrollment,
    user: { id: string; role: UserRole },
  ): void {
    if (user?.role === UserRole.ADMIN) return;
    if (enrollment.student?.id !== user?.id) {
      throw new ForbiddenException('Esta inscripción no te pertenece');
    }
  }
}