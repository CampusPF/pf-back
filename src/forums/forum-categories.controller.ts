import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ForumCategoriesService } from './forum-categories.service';
import { CreateForumCategoryDto, UpdateForumCategoryDto } from './dto/forum-category.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('forums')
@ApiBearerAuth()
@Controller('forum/categories')
export class ForumCategoriesController {
  constructor(private readonly categories: ForumCategoriesService) { }

  @Get()
  @ApiOperation({ summary: 'Categorías activas del foro general' })
  list() {
    return this.categories.findActive();
  }

  @Get('all')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Todas las categorías, también las ocultas (admin)' })
  listAll() {
    return this.categories.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear una categoría del foro general (admin)' })
  create(@Body() dto: CreateForumCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar una categoría o ocultarla (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateForumCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }
}
