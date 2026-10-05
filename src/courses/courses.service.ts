import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { generateUniqueSlug } from './utils/slug.util';
import {
  Actor,
  assertCanRemoveCourse,
  assertCanRestoreCourse,
  assertCourseOwner,
} from '../common/utils/assert-course-owner.util';
import {
  CloudinaryService,
  UPLOAD_FOLDERS,
} from '../file-upload/cloudinary.service';
import { EVENTS, CourseRenamedEvent, CourseBlockedByAdminEvent } from '../events';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly cloudinary: CloudinaryService,
    private readonly eventEmitter: EventEmitter2,
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

    // El slug sale del título salvo que venga uno explícito en el dto. En
    // ambos casos se slugifica y, si ya existe, se le agrega sufijo numérico
    // (dos cursos con el mismo título son válidos).
    const slug = await generateUniqueSlug(
      dto.slug ?? dto.title,
      async (candidate) =>
        (await this.coursesRepository.countBy({ slug: candidate })) > 0,
    );

    const course = this.coursesRepository.create({
      title: dto.title,
      slug,
      description: dto.description,
      difficulty: dto.difficulty,
      // La portada se sube aparte (POST /courses/:id/image): ver el comentario
      // en CreateCourseDto. Al crear no hay id todavía, así que no hay imagen.
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

  /**
   * El curso con su temario completo: módulos vivos, cada uno con sus
   * lecciones vivas, todo ordenado.
   *
   * Es público a propósito. El temario es lo que decide una compra, y antes
   * sin sesión sólo se veían los títulos de los módulos (el front tenía que
   * pedir `GET /lessons?moduleId=` por cada módulo, que exige login: N
   * requests para alguien logueado y nada para una visita).
   *
   * No filtra nada por acceso ni hace falta: `content` y `videoUrl` son
   * `select: false` en la entidad Lesson, así que ninguna query los trae
   * salvo `LessonsService.findOne`, que es donde `LessonsAccessService`
   * decide. De acá sólo salen título, duración, orden y si es de muestra.
   *
   * Aparte de `findOne` porque ese lo usan las escrituras (update, remove,
   * updateImage) y el admin, que necesitan los módulos inactivos también y no
   * tienen por qué cargar el temario entero.
   */
  async findOneWithSyllabus(id: string): Promise<Course> {
    const course = await this.coursesRepository.findOne({
      where: { id },
      relations: { category: true, instructor: true, modules: { lessons: true } },
    });

    if (!course) {
      throw new NotFoundException(`Curso con id ${id} no encontrado`);
    }

    return this.withLiveSyllabus(course);
  }

  /**
   * Mismo curso que `findOneWithSyllabus`, pero buscado por slug.
   *
   * El front navega por slug (`/courses/:slug`): sin esto tenía que bajar el
   * catálogo entero en cada visita sólo para traducir slug → id.
   */
  async findBySlug(slug: string): Promise<Course> {
    const course = await this.coursesRepository.findOne({
      // `isActive: true` a propósito: esta ruta es la que abre el detalle
      // público. Antes el front resolvía el slug contra `GET /courses`, que ya
      // filtra los inactivos, así que un curso dado de baja daba "no
      // encontrado"; sin esta condición pasaría a ser visible.
      where: { slug, isActive: true },
      relations: { category: true, instructor: true, modules: { lessons: true } },
    });

    if (!course) {
      throw new NotFoundException(`Curso con slug ${slug} no encontrado`);
    }

    return this.withLiveSyllabus(course);
  }

  /* El filtrado va en memoria y no en el `where`: filtrar una relación en
     TypeORM condiciona también qué cursos vuelven (un curso sin módulos vivos
     desaparecería en vez de venir con el temario vacío). Es un curso por
     request, no un listado. */
  private withLiveSyllabus(course: Course): Course {
    course.modules = (course.modules ?? [])
      .filter((courseModule) => courseModule.isActive)
      .sort((a, b) => a.order - b.order)
      .map((courseModule) => {
        courseModule.lessons = (courseModule.lessons ?? [])
          .filter((lesson) => lesson.isActive)
          .sort((a, b) => a.order - b.order);
        return courseModule;
      });

    return course;
  }

  async update(id: string, dto: UpdateCourseDto, actor: Actor): Promise<Course> {
    const course = await this.findOne(id);
    assertCourseOwner(course, actor);

    if (dto.categoryId) {
      const category = await this.categoriesRepository.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Categoría con id ${dto.categoryId} no encontrada`);
      }
      course.category = category;
    }

    // El slug sigue al título: antes se generaba sólo al crear, así que un
    // curso renombrado quedaba con la URL del nombre viejo
    // ("Curso de Routing en React" en /courses/prueba-agregar-curso).
    // Un slug explícito en el dto tiene prioridad. Ojo: los links viejos al
    // curso dejan de resolver (el front busca por slug).
    const slugSource =
      dto.slug ?? (dto.title && dto.title !== course.title ? dto.title : undefined);
    if (slugSource) {
      course.slug = await generateUniqueSlug(
        slugSource,
        async (candidate) =>
          candidate !== course.slug &&
          (await this.coursesRepository.countBy({ slug: candidate })) > 0,
      );
    }

    const renamed = dto.title !== undefined && dto.title !== course.title;

    Object.assign(course, {
      title: dto.title ?? course.title,
      description: dto.description ?? course.description,
      difficulty: dto.difficulty ?? course.difficulty,
      priceInCents: dto.priceInCents ?? course.priceInCents,
      currency: dto.currency ?? course.currency,
    });

    const saved = await this.coursesRepository.save(course);

    // Los certificados llevan el nombre del curso impreso: se regeneran
    // (CertificatesListener) para que muestren el nuevo.
    if (renamed) {
      this.eventEmitter.emit(EVENTS.COURSE_RENAMED, new CourseRenamedEvent(course.id));
    }

    return saved;
  }

  /**
   * Reemplaza la portada del curso por un archivo subido a Cloudinary.
   *
   * Se guarda el publicId junto a la URL: sin él no habría forma de borrar el
   * archivo viejo cuando se suba uno nuevo. Si la portada actual era una URL
   * externa (seed), imagePublicId es null y no hay nada que borrar.
   */
  async updateImage(id: string, file: Express.Multer.File, actor: Actor): Promise<Course> {
    const course = await this.findOne(id);
    assertCourseOwner(course, actor);

    const { url, publicId } = await this.cloudinary.replaceImage(
      file,
      UPLOAD_FOLDERS.COURSES,
      course.imagePublicId,
    );

    course.imageUrl = url;
    course.imagePublicId = publicId;

    return this.coursesRepository.save(course);
  }

  /**
   * Borrado lógico: un curso con inscripciones activas no se puede eliminar
   * físicamente sin romper el historial de esos estudiantes. Se marca
   * isActive:false para sacarlo del catálogo público sin perder datos.
   *
   * `deactivatedByAdmin` queda registrado según quién lo bajó: es lo que
   * `assertCanRestoreCourse`/`assertCourseOwner` usan después para que un
   * docente no pueda reactivar (ni seguir editando) algo que un admin bajó.
   */
  async remove(id: string, actor: Actor): Promise<Course> {
      const course = await this.findOne(id);
    // Lo único que el ADMIN puede hacer sobre un curso (además de restaurarlo).
    assertCanRemoveCourse(course, actor);
    course.isActive = false;
    course.deactivatedByAdmin = actor.role === UserRole.ADMIN;
    const saved = await this.coursesRepository.save(course);

    // Avisar al docente SOLO si fue un admin quien lo desactivó y hay
    // instructor a quien avisar. Si el propio docente lo pausa, no hay mail.
    if (actor.role === UserRole.ADMIN && saved.instructor) {
      this.eventEmitter.emit(
        EVENTS.COURSE_BLOCKED_BY_ADMIN,
        new CourseBlockedByAdminEvent(
          saved.instructor.id,
          saved.id,
          saved.title,
          new Date(), 
        ),
      );
    }

    return saved;
  }

  /**
   * Si el ADMIN lo desactivó, sólo un ADMIN puede restaurarlo — ver
   * assertCanRestoreCourse. `deactivatedByAdmin` se resetea acá: una vez
   * restaurado, una próxima baja del propio docente arranca "limpia".
   */
  async restore(id: string, actor: Actor): Promise<Course> {
    const course = await this.findOne(id);
    assertCanRestoreCourse(course, actor);
    course.isActive = true;
    course.deactivatedByAdmin = false;
    return this.coursesRepository.save(course);
  }
}