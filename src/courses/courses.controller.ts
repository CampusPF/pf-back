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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IMAGE_UPLOAD_OPTIONS,
  assertFilePresent,
} from '../file-upload/file-validation';
import { CoursesService } from './courses.service';
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
  constructor(private readonly coursesService: CoursesService) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un nuevo curso' })
  @ApiResponse({ status: 201, description: 'Curso creado exitosamente' })
  @ApiResponse({ status: 404, description: 'Categoría o Instructor no encontrado' })
  create(
    @Body() createCourseDto: CreateCourseDto,
    @CurrentUser('id') instructorId: string,
  ) {
    return this.coursesService.create(createCourseDto, instructorId);
  }

  // El catálogo de cursos es la vitrina del sitio: el front lo muestra sin
  // login, así que se marca @Public() de forma explícita ahora que el
  // JwtAuthGuard es global.
  @Get()
  @Public()
  @ApiOperation({ summary: 'Obtener todos los cursos' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.coursesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Obtener un curso por ID' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  @ApiResponse({ status: 503, description: 'Cloudinary no configurado' })
  updateImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.coursesService.updateImage(id, assertFilePresent(file));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar un curso' })
  @ApiResponse({ status: 404, description: 'Curso o Categoría no encontrada' })
  update(@Param('id') id: string, @Body() updateCourseDto: UpdateCourseDto) {
    return this.coursesService.update(id, updateCourseDto);
  }

  @Patch(':id/restore')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reactivar un curso previamente eliminado' })
  restore(@Param('id') id: string) {
    return this.coursesService.restore(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un curso (borrado lógico)' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  remove(@Param('id') id: string) {
    return this.coursesService.remove(id);
  }
}