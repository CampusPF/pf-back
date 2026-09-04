import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CourseEnrollmentsService } from './course-enrollments.service';
import { CreateCourseEnrollmentDto } from './dto/create-course-enrollment.dto';
import { UpdateCourseEnrollmentDto } from './dto/update-course-enrollment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('course-enrollments')
@ApiBearerAuth()
@Controller('course-enrollments')
export class CourseEnrollmentsController {
  constructor(private readonly courseEnrollmentsService: CourseEnrollmentsService) { }

  @Post()
  @ApiOperation({ summary: 'Inscribirse a un curso' })
  @ApiResponse({ status: 201, description: 'Inscripción creada correctamente' })
  @ApiResponse({ status: 409, description: 'Ya estás inscripto en este curso' })
  create(
    @Body() createCourseEnrollmentDto: CreateCourseEnrollmentDto,
    @CurrentUser('id') studentId: string,
  ) {
    return this.courseEnrollmentsService.create(createCourseEnrollmentDto, studentId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las inscripciones' })
  findAll() {
    return this.courseEnrollmentsService.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: 'Listar mis inscripciones' })
  findMine(@CurrentUser('id') studentId: string) {
    return this.courseEnrollmentsService.findAllByStudent(studentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una inscripción por ID' })
  @ApiResponse({ status: 404, description: 'Inscripción no encontrada' })
  findOne(@Param('id') id: string) {
    return this.courseEnrollmentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar progreso de una inscripción' })
  update(
    @Param('id') id: string,
    @Body() updateCourseEnrollmentDto: UpdateCourseEnrollmentDto,
  ) {
    return this.courseEnrollmentsService.update(id, updateCourseEnrollmentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancelar una inscripción' })
  remove(@Param('id') id: string) {
    return this.courseEnrollmentsService.remove(id);
  }
}