import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LessonProgressService } from './lesson-progress.service';
import { CreateLessonProgressDto } from './dto/create-lesson-progress.dto';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * El progreso de lecciones es información personal del alumno.
 *
 * Regla del módulo: NUNCA se resuelve por un id de usuario que venga del
 * cliente. El dueño del recurso se deduce siempre del JWT (@CurrentUser) y el
 * service valida la titularidad contra la inscripción asociada.
 *
 * La autenticación la aplica el JwtAuthGuard global (ver app.module.ts).
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
    // Antes este parámetro venía sin decorador, así que Nest le pasaba
    // undefined y el chequeo de titularidad del service nunca comparaba
    // contra un usuario real.
    @CurrentUser('id') userId: string,
  ) {
    return this.lessonProgressService.create(createLessonProgressDto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Listar el progreso de todos los alumnos' })
  findAll() {
    // Operación de administración explícita: devuelve el progreso de toda la
    // plataforma, por eso queda restringida a ADMIN.
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
  @ApiOperation({ summary: 'Borrar un registro de progreso propio' })
  @ApiResponse({ status: 403, description: 'Ese progreso no te pertenece' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.lessonProgressService.remove(id, user);
  }
}
