import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LessonProgressService } from './lesson-progress.service';
import { CreateLessonProgressDto } from './dto/create-lesson-progress.dto';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';

/**
 * El progreso de lecciones es información personal del alumno.
 *
 * Regla del módulo: NUNCA se resuelve por un id de usuario que venga del
 * cliente. El dueño del recurso se deduce siempre del JWT (@CurrentUser) y el
 * service valida la titularidad contra la inscripción asociada.
 *
 * DELETE acá es físico a propósito (no hay borrado lógico): un registro de
 * progreso no es un recurso "catálogo" que se oculte, es el hecho de que el
 * alumno completó o no una lección — borrarlo significa resetear ese hecho.
 *
 * La autenticación la aplica el JwtAuthGuard global (ver app.module.ts).
 * RolesGuard NO es global: hay que aplicarlo explícitamente donde se usa @Roles().
 */
@ApiTags('lesson-progress')
@ApiBearerAuth()
@Controller('lesson-progress')
export class LessonProgressController {
  constructor(private readonly lessonProgressService: LessonProgressService) { }

  @Post()
  @ApiOperation({ summary: 'Registrar progreso en una lección (de mi inscripción)' })
  @ApiResponse({ status: 403, description: 'Esa inscripción no te pertenece' })
  create(
    @Body() createLessonProgressDto: CreateLessonProgressDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.lessonProgressService.create(createLessonProgressDto, userId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Listar el progreso de todos los alumnos' })
  findAll() {
    return this.lessonProgressService.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: 'Listar mi progreso en todas mis lecciones' })
  findMine(@CurrentUser('id') userId: string) {
    return this.lessonProgressService.findAllByUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un registro de progreso propio' })
  @ApiResponse({ status: 403, description: 'Ese progreso no te pertenece' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.lessonProgressService.findOneForUser(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un registro de progreso propio' })
  @ApiResponse({ status: 403, description: 'Ese progreso no te pertenece' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLessonProgressDto: UpdateLessonProgressDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.lessonProgressService.update(id, updateLessonProgressDto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borrar (físicamente) un registro de progreso propio' })
  @ApiResponse({ status: 403, description: 'Ese progreso no te pertenece' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.lessonProgressService.remove(id, user);
  }
}