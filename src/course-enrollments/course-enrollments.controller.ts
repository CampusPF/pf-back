import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CourseEnrollmentsService } from './course-enrollments.service';
import { CreateCourseEnrollmentDto } from './dto/create-course-enrollment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';

/**
 * Una inscripción es un recurso "de un usuario".
 *
 * Regla del módulo: el alumno dueño sale SIEMPRE del JWT (@CurrentUser), nunca
 * de un studentId que mande el cliente. El DTO de creación, de hecho, solo
 * acepta courseId, así que no hay forma de inscribir a otra persona.
 *
 * La autenticación la aplica el JwtAuthGuard global (ver app.module.ts).
 * RolesGuard NO es global: hay que aplicarlo explícitamente donde se usa @Roles().
 */
@ApiTags('course-enrollments')
@ApiBearerAuth()
@Controller('course-enrollments')
export class CourseEnrollmentsController {
  constructor(private readonly courseEnrollmentsService: CourseEnrollmentsService) { }

  @Post()
  @ApiOperation({
    summary: 'Inscribirme a un curso gratis (o a cualquiera, con Premium o siendo admin/teacher)',
    description:
      'Cursos con priceInCents = 0, o cualquier curso si el usuario tiene una ' +
      'suscripción ACTIVE o es ADMIN/TEACHER. Si no, un curso pago responde 402: ' +
      'hay que pagarlo con POST /payments/create-intent y la inscripción la crea el webhook.',
  })
  @ApiResponse({ status: 201, description: 'Inscripción creada correctamente' })
  @ApiResponse({ status: 402, description: 'El curso es pago y el usuario no tiene acceso sin pagar' })
  @ApiResponse({ status: 409, description: 'Ya estás inscripto en este curso' })
  create(
    @Body() createCourseEnrollmentDto: CreateCourseEnrollmentDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    // allowPaid queda en false: la inscripción paga la crea PaymentsService
    // desde el webhook. Suscripción activa, admin y docente en su propio curso
    // los resuelve el service.
    return this.courseEnrollmentsService.create(createCourseEnrollmentDto, user.id, {
      role: user.role,
    });
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Listar todas las inscripciones de la plataforma' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    // Devuelve inscripciones de todos los alumnos (con sus datos personales):
    // operación de administración explícita, restringida a ADMIN.
    // Un alumno consulta las suyas por GET /course-enrollments/me.
    return this.courseEnrollmentsService.findAll(includeInactive === 'true');
  }

  @Get('me')
  @ApiOperation({ summary: 'Listar mis inscripciones' })
  findMine(
    @CurrentUser('id') studentId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.courseEnrollmentsService.findAllByStudent(studentId, includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una inscripción propia por ID' })
  @ApiResponse({ status: 403, description: 'Esa inscripción no te pertenece' })
  @ApiResponse({ status: 404, description: 'Inscripción no encontrada' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.courseEnrollmentsService.findOneForUser(id, user);
  }

  /* Se quitó `PATCH /course-enrollments/:id`. Sus dos únicos campos eran
     `progressPercent` y `completedAt`, y ahora los DERIVA el back: los
     recalcula LessonProgressService cada vez que se marca, desmarca o borra
     una lección (ver recalculateEnrollmentProgress).

     Dejar el endpoint significaba que cualquier cliente podía escribirse el
     porcentaje que quisiera y pisar el valor real. La forma de mover el
     progreso es completar lecciones. Cancelar y reactivar siguen teniendo sus
     propios endpoints, acá abajo. */

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Reactivar una inscripción propia previamente cancelada' })
  @ApiResponse({ status: 403, description: 'Esa inscripción no te pertenece' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.courseEnrollmentsService.restore(id, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancelar una inscripción propia (borrado lógico)' })
  @ApiResponse({ status: 403, description: 'Esa inscripción no te pertenece' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.courseEnrollmentsService.remove(id, user);
  }
}