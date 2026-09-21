import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CourseEnrollment } from './entities/course-enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateCourseEnrollmentDto } from './dto/create-course-enrollment.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MailService } from '../mail/mail.service';
import { enrollmentEmail } from '../mail/templates/enrollment.template';
@Injectable()
export class CourseEnrollmentsService {
  private readonly logger = new Logger(CourseEnrollmentsService.name); 

  constructor(
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentsRepository: Repository<CourseEnrollment>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly mail: MailService,
    private readonly config: ConfigService, 
  ) { }

  /**
   * Si ya existe una inscripción CANCELADA (isActive:false) para este mismo
   * alumno+curso, la reactivamos en vez de crear una fila nueva — la
   * restricción @Unique(['student','course']) no permite dos filas para el
   * mismo par, sin importar el estado.
   *
   * `allowPaid`: por defecto false. Un curso con `priceInCents > 0` NO se
   * puede inscribir por esta vía (responde 402): tiene que pasar por
   * POST /payments/create-intent y la inscripción la crea el webhook de
   * Stripe, que es el único que llama esto con `allowPaid: true`.
   *
   * Excepción: con una suscripción ACTIVE sí se puede. El plan ya da acceso
   * al contenido de todo el catálogo; sin inscripción el suscriptor veía las
   * lecciones pero no podía registrar progreso (LessonProgress cuelga de la
   * inscripción). No regala nada que el plan no incluya.
   *
   * Lo mismo para el ADMIN (`role`), que ve el contenido de todo el catálogo
   * (LessonsAccessService) y no puede comprar (el checkout le está cerrado), y
   * para el TEACHER en SUS cursos. En cursos pagos ajenos, un TEACHER es un
   * alumno más: compra o se suscribe.
   */
  async create(
    dto: CreateCourseEnrollmentDto,
    studentId: string,
    { allowPaid = false, role }: { allowPaid?: boolean; role?: UserRole } = {},
  ): Promise<CourseEnrollment> {
    const course = await this.coursesRepository.findOne({
      where: { id: dto.courseId },
      relations: { instructor: true },
    });
    if (!course) {
      throw new NotFoundException(`Curso con id ${dto.courseId} no encontrado`);
    }

    const freeForRole =
      role === UserRole.ADMIN ||
      (role === UserRole.TEACHER && course.instructor?.id === studentId);
    if (
      course.priceInCents > 0 &&
      !allowPaid &&
      !freeForRole &&
      !(await this.subscriptionsService.hasActiveSubscription(studentId))
    ) {
      throw new HttpException(
        'Este curso es pago. Iniciá el pago con POST /payments/create-intent.',
        HttpStatus.PAYMENT_REQUIRED,
      );
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

    this.sendEnrollmentMail(student, course).catch((err) =>
      this.logger.error(
        `Error enviando mail de inscripción a ${student.email}`,
        err,
      ),
    );

    const enrollment = this.enrollmentsRepository.create({ student, course });
    return this.enrollmentsRepository.save(enrollment);
  }

  /** ¿El alumno tiene una inscripción ACTIVA a este curso? */
  async hasActiveEnrollment(studentId: string, courseId: string): Promise<boolean> {
    const count = await this.enrollmentsRepository.count({
      where: { student: { id: studentId }, course: { id: courseId }, isActive: true },
    });
    return count > 0;
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

  /* Se quitó `update()` junto con su endpoint y su DTO: escribía
     `progressPercent` y `completedAt` a partir del body del cliente, y esos
     dos campos ahora los deriva el back en
     LessonProgressService.recalculateEnrollmentProgress. */

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

  private async sendEnrollmentMail(student: User, course: Course): Promise<void> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const courseUrl = `${frontendUrl}/courses/${course.id}`;

    await this.mail.send(
      student.email,
      `¡Te inscribiste a ${course.title}! 🎉`,
      enrollmentEmail({
        studentName: student.name,
        courseName: course.title,
        courseUrl,
        instructorName: course.instructor?.name,
      }),
    );
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