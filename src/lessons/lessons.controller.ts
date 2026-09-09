import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { LessonsAccessService } from './lessons-access.service';
import { Lesson } from './entities/lesson.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';

/** Lección con el flag de acceso; content/videoUrl van null si no hay acceso. */
type LessonView = Omit<Lesson, 'content' | 'videoUrl'> & {
  hasAccess: boolean;
  content: string | null;
  videoUrl: string | null;
};

/**
 * El JwtAuthGuard es global (APP_GUARD): leer exige estar logueado por
 * defecto. RolesGuard NO es global, así que hay que aplicarlo explícitamente
 * en cada ruta que además necesite restringir por rol.
 */
@ApiTags('lessons')
@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly lessonsService: LessonsService,
    private readonly lessonsAccess: LessonsAccessService,
  ) { }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear una lección dentro de un módulo' })
  @ApiResponse({ status: 201, description: 'Lección creada correctamente' })
  @ApiResponse({ status: 404, description: 'Módulo no encontrado' })
  create(@Body() dto: CreateLessonDto) {
    return this.lessonsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las lecciones (opcionalmente filtradas por módulo)' })
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
      '(curso pago sin inscripción activa ni suscripción ACTIVE), devuelve ' +
      'content y videoUrl en null y hasAccess:false. Título/orden/módulo van ' +
      'siempre, para poder mostrar un CTA de compra.',
  })
  @ApiResponse({ status: 404, description: 'Lección no encontrada' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<LessonView> {
    const lesson = await this.lessonsService.findOne(id);
    const hasAccess = await this.lessonsAccess.canAccessCourseContent(
      userId,
      lesson.module?.course,
    );

    const { content, videoUrl, ...rest } = lesson;
    return {
      ...rest,
      hasAccess,
      content: hasAccess ? (content ?? null) : null,
      videoUrl: hasAccess ? (videoUrl ?? null) : null,
    };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar una lección' })
  update(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.lessonsService.update(id, dto);
  }

  @Patch(':id/restore')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reactivar una lección previamente eliminada' })
  restore(@Param('id') id: string) {
    return this.lessonsService.restore(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar una lección (borrado lógico)' })
  remove(@Param('id') id: string) {
    return this.lessonsService.remove(id);
  }
}