import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CourseModulesService } from './course-modules.service';
import { CreateCourseModuleDto } from './dto/create-course-module.dto';
import { UpdateCourseModuleDto } from './dto/update-course-module.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * Antes este controller no tenía ningún guard: cualquiera, sin token, podía
 * crear o borrar módulos de cualquier curso. Ahora escribir es solo ADMIN, y
 * leer exige estar logueado (por el JwtAuthGuard global) — decisión de
 * producto: el temario solo se ve con sesión iniciada, no es parte de la
 * vitrina pública del curso.
 */
@ApiTags('course-modules')
@ApiBearerAuth()
@Controller('course-modules')
export class CourseModulesController {
  constructor(private readonly courseModulesService: CourseModulesService) { }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createCourseModuleDto: CreateCourseModuleDto) {
    return this.courseModulesService.create(createCourseModuleDto);
  }

  @Get()
  findAll() {
    return this.courseModulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.courseModulesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateCourseModuleDto: UpdateCourseModuleDto) {
    return this.courseModulesService.update(id, updateCourseModuleDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.courseModulesService.remove(id);
  }
}
