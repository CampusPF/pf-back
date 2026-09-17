import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CourseModulesService } from './course-modules.service';
import { CreateCourseModuleDto } from './dto/create-course-module.dto';
import { UpdateCourseModuleDto } from './dto/update-course-module.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';

/**
 * El JwtAuthGuard es global (APP_GUARD): leer exige estar logueado por
 * defecto. RolesGuard NO es global, así que hay que aplicarlo explícitamente
 * en cada ruta que además necesite restringir por rol.
 */
@ApiTags('course-modules')
@ApiBearerAuth()
@Controller('course-modules')
export class CourseModulesController {
  constructor(private readonly courseModulesService: CourseModulesService) { }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  create(
    @Body() createCourseModuleDto: CreateCourseModuleDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.courseModulesService.create(createCourseModuleDto, user);
  }

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.courseModulesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.courseModulesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  update(
    @Param('id') id: string,
    @Body() updateCourseModuleDto: UpdateCourseModuleDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.courseModulesService.update(id, updateCourseModuleDto, user);
  }

  @Patch(':id/restore')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  restore(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.courseModulesService.restore(id, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiResponse({ status: 403, description: 'El curso no es tuyo (el ADMIN no edita contenido)' })
  remove(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.courseModulesService.remove(id, user);
  }
}