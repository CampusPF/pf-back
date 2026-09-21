import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IMAGE_UPLOAD_OPTIONS,
  assertFilePresent,
} from '../file-upload/file-validation';
import { CoursesService } from './courses.service';
import { CourseStatsService } from './course-stats.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly courseStatsService: CourseStatsService,
  ) { }

  // Crear, editar y cambiar la portada: sólo TEACHER. El ADMIN no arma ni
  // modifica cursos (contenido, precio, nada): sólo los elimina o restaura.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Crear un nuevo curso (sólo docentes)' })
  @ApiResponse({ status: 201, description: 'Curso creado exitosamente' })
  @ApiResponse({ status: 404, description: 'Categoría o Instructor no encontrado' })
  create(
    @Body() createCourseDto: CreateCourseDto,
    // Quien crea el curso es siempre su instructor — el dto no tiene ese
    // campo, así que un TEACHER no puede asignárselo a otra persona.
    @CurrentUser('id') instructorId: string,
  ) {
    return this.coursesService.create(createCourseDto, instructorId);
  }

  // El catálogo de cursos es la vitrina del sitio: el front lo muestra sin
  // login, así que se marca @Public() de forma explícita ahora que el
  // JwtAuthGuard es global.
  // Las stats (ratingAverage, reviewsCount, studentsCount) se agregan acá y
  // no en CoursesService.findOne/findAll: esos también los usan las
  // escrituras (update, restore…), que no necesitan dos queries de más.
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Obtener todos los cursos',
    description:
      'Cada curso incluye ratingAverage (null sin reseñas), reviewsCount, studentsCount, ' +
      'lessonsCount y totalDurationMinutes (el listado no trae el temario).',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Si es "true", incluye también los cursos inactivos',
  })
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const courses = await this.coursesService.findAll(includeInactive === 'true');
    return this.courseStatsService.withStats(courses);
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary:
      'Obtener un curso por ID (con ratingAverage, reviewsCount, studentsCount, lessonsCount y totalDurationMinutes)',
  })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  async findOne(@Param('id') id: string) {
    const [course] = await this.courseStatsService.withStats([
      await this.coursesService.findOne(id),
    ]);
    return course;
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG o WEBP. Máx. 5MB.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Subir o reemplazar la portada del curso',
    description:
      'La imagen se sube a Cloudinary y reemplaza a la anterior, que se ' +
      'borra. Devuelve el curso actualizado.',
  })
  @ApiResponse({ status: 400, description: 'Archivo faltante, muy grande o que no es una imagen' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo, o sos ADMIN' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  @ApiResponse({ status: 503, description: 'Cloudinary no configurado' })
  updateImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.coursesService.updateImage(id, assertFilePresent(file), user);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Actualizar un curso (sólo su instructor)' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo, o sos ADMIN' })
  @ApiResponse({ status: 404, description: 'Curso o Categoría no encontrada' })
  update(
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.coursesService.update(id, updateCourseDto, user);
  }

  @Patch(':id/restore')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Reactivar un curso previamente eliminado (su instructor o ADMIN)' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (sólo aplica a TEACHER)' })
  restore(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.coursesService.restore(id, user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Eliminar un curso (borrado lógico; su instructor o ADMIN)' })
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (sólo aplica a TEACHER)' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  remove(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.coursesService.remove(id, user);
  }
}