import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@ApiTags('lessons')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) { }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear una lección dentro de un módulo' })
  @ApiResponse({ status: 201, description: 'Lección creada correctamente' })
  @ApiResponse({ status: 404, description: 'Módulo no encontrado' })
  create(@Body() dto: CreateLessonDto) {
    return this.lessonsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las lecciones (opcionalmente filtradas por módulo)' })
  findAll(@Query('moduleId') moduleId?: string) {
    if (moduleId) {
      return this.lessonsService.findAllByModule(moduleId);
    }
    return this.lessonsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una lección por ID' })
  @ApiResponse({ status: 404, description: 'Lección no encontrada' })
  findOne(@Param('id') id: string) {
    return this.lessonsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar una lección' })
  update(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.lessonsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar una lección' })
  remove(@Param('id') id: string) {
    return this.lessonsService.remove(id);
  }
}