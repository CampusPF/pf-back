import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ForumsService } from './forums.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessActor } from '../lessons/lessons-access.service';
import { CreateForumPostDto, CreateForumThreadDto, UpdateForumPostDto, UpdateForumThreadDto } from './dto/forum-thread.dto';
import { ModerateForumThreadDto, SetForumSolutionDto } from './dto/forum-moderation.dto';
import { ListForumQuery } from './dto/list-forum.query';
import { FORUM_PAGE_SIZE } from './forum.constants';

/** Anti-spam para escrituras: 20 por minuto y por usuario. */
const WRITE_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

/**
 * Foros de curso, foro general, hilos y respuestas. Las rutas llevan el id del
 * recurso y el permiso se resuelve en ForumsService/ForumAccessService; el
 * autor siempre sale del JWT (`@CurrentUser`), nunca del body.
 */
@ApiTags('forums')
@ApiBearerAuth()
@Controller()
export class ForumsController {
  constructor(private readonly forums: ForumsService) { }

  // ---------- Foro de curso ----------

  @Get('courses/:courseId/forum/threads')
  @ApiOperation({ summary: 'Hilos del foro de un curso (alumnos inscriptos, docente y admin)' })
  @ApiResponse({ status: 403, description: 'No tenés acceso al curso' })
  listCourseThreads(
    @CurrentUser() user: AccessActor,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: ListForumQuery,
  ) {
    return this.forums.listCourseThreads(user, courseId, query.page ?? 1, query.limit ?? FORUM_PAGE_SIZE);
  }

  @Post('courses/:courseId/forum/threads')
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Abrir un hilo en el foro de un curso' })
  @ApiResponse({ status: 422, description: 'Texto rechazado por moderación' })
  createCourseThread(
    @CurrentUser() user: AccessActor,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: CreateForumThreadDto,
  ) {
    return this.forums.createCourseThread(user, courseId, dto);
  }

  // ---------- Foro general ----------

  @Get('forum/categories/:categoryId/threads')
  @ApiOperation({ summary: 'Hilos de una categoría del foro general (con suscripción o algún curso comprado)' })
  @ApiResponse({ status: 403, description: 'Sin suscripción activa ni cursos comprados' })
  listCategoryThreads(
    @CurrentUser() user: AccessActor,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query() query: ListForumQuery,
  ) {
    return this.forums.listCategoryThreads(user, categoryId, query.page ?? 1, query.limit ?? FORUM_PAGE_SIZE);
  }

  @Post('forum/categories/:categoryId/threads')
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Abrir un hilo en una categoría del foro general' })
  createCategoryThread(
    @CurrentUser() user: AccessActor,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: CreateForumThreadDto,
  ) {
    return this.forums.createCategoryThread(user, categoryId, dto);
  }

  // ---------- Hilo ----------

  @Get('forum/threads/:threadId')
  @ApiOperation({ summary: 'Detalle de un hilo, con los permisos del usuario sobre él' })
  getThread(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    return this.forums.getThread(user, threadId);
  }

  @Patch('forum/threads/:threadId')
  @ApiOperation({ summary: 'Editar título o mensaje de un hilo (autor o moderador)' })
  updateThread(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() dto: UpdateForumThreadDto,
  ) {
    return this.forums.updateThread(user, threadId, dto);
  }

  @Delete('forum/threads/:threadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar un hilo (autor o moderador)' })
  deleteThread(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    return this.forums.deleteThread(user, threadId);
  }

  @Patch('forum/threads/:threadId/moderation')
  @ApiOperation({ summary: 'Fijar o cerrar un hilo (moderador)' })
  @ApiResponse({ status: 403, description: 'No sos moderador de este hilo' })
  moderateThread(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() dto: ModerateForumThreadDto,
  ) {
    return this.forums.moderateThread(user, threadId, dto);
  }

  @Put('forum/threads/:threadId/solution')
  @ApiOperation({ summary: 'Marcar una respuesta como solución del hilo' })
  setSolution(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() dto: SetForumSolutionDto,
  ) {
    return this.forums.setSolution(user, threadId, dto.postId);
  }

  @Delete('forum/threads/:threadId/solution')
  @ApiOperation({ summary: 'Quitar la solución del hilo' })
  clearSolution(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    return this.forums.clearSolution(user, threadId);
  }

  // ---------- Respuestas ----------

  @Get('forum/threads/:threadId/posts')
  @ApiOperation({ summary: 'Respuestas de un hilo (paginadas, de la más vieja)' })
  listPosts(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(FORUM_PAGE_SIZE), ParseIntPipe) limit: number,
  ) {
    return this.forums.listPosts(user, threadId, Math.max(1, page), Math.min(50, Math.max(1, limit)));
  }

  @Post('forum/threads/:threadId/posts')
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Responder en un hilo' })
  @ApiResponse({ status: 403, description: 'Hilo cerrado o sin acceso' })
  @ApiResponse({ status: 422, description: 'Texto rechazado por moderación' })
  createPost(
    @CurrentUser() user: AccessActor,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() dto: CreateForumPostDto,
  ) {
    return this.forums.createPost(user, threadId, dto);
  }

  @Patch('forum/posts/:postId')
  @ApiOperation({ summary: 'Editar una respuesta (autor o moderador)' })
  updatePost(
    @CurrentUser() user: AccessActor,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: UpdateForumPostDto,
  ) {
    return this.forums.updatePost(user, postId, dto);
  }

  @Delete('forum/posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar una respuesta (autor o moderador)' })
  deletePost(
    @CurrentUser() user: AccessActor,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.forums.deletePost(user, postId);
  }

  // ---------- Mis foros ----------

  @Get('forum/me/activity')
  @ApiOperation({ summary: 'Mis foros: actividad reciente de mis cursos y de mis hilos' })
  myActivity(@CurrentUser() user: AccessActor) {
    return this.forums.myActivity(user);
  }
}
