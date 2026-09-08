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
import { UpdateCourseEnrollmentDto } from './dto/update-course-enrollment.dto';
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
  @ApiOperation({ summary: 'Inscribirme a un curso' })
  @ApiResponse({ status: 201, description: 'Inscripción creada correctamente' })
  @ApiResponse({ status: 409, description: 'Ya estás inscripto en este curso' })
  create(
    @Body() createCourseEnrollmentDto: CreateCourseEnrollmentDto,
    @CurrentUser('id') studentId: string,
  ) {
    return this.courseEnrollmentsService.create(createCourseEnrollmentDto, studentId);
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

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar el progreso de una inscripción propia' })
  @ApiResponse({ status: 403, description: 'Esa inscripción no te pertenece' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCourseEnrollmentDto: UpdateCourseEnrollmentDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.courseEnrollmentsService.update(id, updateCourseEnrollmentDto, user);
  }

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