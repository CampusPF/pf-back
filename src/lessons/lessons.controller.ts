import {
  Controller,
  Logger,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { LessonsAccessService } from './lessons-access.service';
import { Lesson } from './entities/lesson.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CourseProgressionService } from '../course-progression/course-progression.service';
import { CourseEnrollmentsService } from '../course-enrollments/course-enrollments.service';

/** Lección con el flag de acceso; content/videoUrl van null si no hay acceso. */
type LessonView = Omit<Lesson, 'content' | 'videoUrl'> & {
  hasAccess: boolean;
  content: string | null;
  videoUrl: string | null;
  /**
   * El módulo todavía no se desbloqueó en la progresión del curso. Es distinto
   * de `hasAccess:false` (que es no haber pagado/inscripto): acá el alumno SÍ
   * tiene derecho al contenido, sólo que le falta terminar el módulo anterior.
   */
  isLockedByProgression: boolean;
};

/**
 * El JwtAuthGuard es global (APP_GUARD): leer exige estar logueado por
 * defecto. RolesGuard NO es global, así que hay que aplicarlo explícitamente
 * en cada ruta que además necesite restringir por rol.
 */
@ApiTags('lessons')
@Controller('lessons')
export class LessonsController {
  private readonly logger = new Logger(LessonsController.name);

  constructor(
    private readonly lessonsService: LessonsService,
    private readonly lessonsAccess: LessonsAccessService,
    private readonly progression: CourseProgressionService,
    private readonly enrollmentsService: CourseEnrollmentsService,
  ) { }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Crear una lección dentro de un módulo' })
  @ApiResponse({ status: 201, description: 'Lección creada correctamente' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  @ApiResponse({ status: 404, description: 'Módulo no encontrado' })
  create(
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.lessonsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las lecciones (opcionalmente filtradas por módulo)' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Si es "true", incluye también los registros inactivos',
  })
  findAll(
    @Query('moduleId') moduleId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const showInactive = includeInactive === 'true';
    if (moduleId) {
      return this.lessonsService.findAllByModule(moduleId, showInactive);
    }
    return this.lessonsService.findAll(showInactive);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una lección por ID',
    description:
      'Siempre responde 200. Si el usuario no tiene acceso al contenido ' +
      '(lección que no es de muestra, sin inscripción activa al curso ni ' +
      'suscripción ACTIVE), devuelve content y videoUrl en null y ' +
      'hasAccess:false. Título/orden/módulo van siempre, para poder mostrar un ' +
      'CTA. El admin y el instructor del curso siempre tienen acceso; otro ' +
      'docente, como cualquier alumno.',
  })
  @ApiResponse({ status: 404, description: 'Lección no encontrada' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ): Promise<LessonView> {
    const lesson = await this.lessonsService.findOne(id);
    const hasAccess = await this.lessonsAccess.canAccessCourseContent(
      user,
      lesson.module?.course,
      lesson,
    );

    const courseId = lesson.module?.course?.id;

    /* Segundo gate, independiente del de acceso: aunque esté inscripto, no
       puede abrir un módulo al que todavía no llegó. Se consulta sólo si ya
       pasó el primero — al que no tiene acceso no hace falta decirle además
       que le falta el módulo anterior. */
    const unlocked =
      !hasAccess ||
      !courseId ||
      (await this.progression.canOpenLesson(user, courseId, lesson.module?.id));

    const serveContent = hasAccess && unlocked;

    /* "Entró al curso": alimenta el recordatorio semanal de inactividad. No
       se espera: abrir la lección no puede tardar más ni fallar por esto.

       Se registra aunque el módulo esté bloqueado por progresión: abrir una
       lección que todavía no le toca SIGUE siendo actividad en el curso, y
       para el recordatorio de inactividad eso es lo que importa. */
    if (hasAccess && courseId && user?.role === UserRole.STUDENT) {
      void this.enrollmentsService
        .touchAccess(user.id, courseId)
        .catch((error: unknown) => {
          this.logger.error(
            `No se pudo registrar el acceso de ${user.id} al curso ${courseId}`,
            error instanceof Error ? error.stack : String(error),
          );
        });
    }

    const { content, videoUrl, ...rest } = lesson;
    return {
      ...rest,
      hasAccess,
      isLockedByProgression: hasAccess && !unlocked,
      content: serveContent ? (content ?? null) : null,
      videoUrl: serveContent ? (videoUrl ?? null) : null,
    };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Actualizar una lección' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.lessonsService.update(id, dto, user);
  }

  @Patch(':id/restore')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Reactivar una lección previamente eliminada' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  restore(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.lessonsService.restore(id, user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Eliminar una lección (borrado lógico)' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  remove(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.lessonsService.remove(id, user);
  }
}