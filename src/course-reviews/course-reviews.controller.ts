import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CourseReviewsService } from './course-reviews.service';
import { UpsertCourseReviewDto } from './dto/upsert-course-review.dto';
import { ListCourseReviewsQuery } from './dto/list-course-reviews.query';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Reseñas de un curso. Todo cuelga de /courses/:courseId/reviews.
 *
 * La reseña propia se maneja por `/me` (nunca por id): el dueño sale del JWT,
 * así no hay forma de editar o borrar la reseña de otro cambiando un id.
 *
 * Sin moderación: nadie (tampoco el ADMIN) borra ni filtra reseñas ajenas,
 * y el comentario se publica tal cual lo manda quien reseña.
 */
@ApiTags('course-reviews')
@ApiBearerAuth()
@Controller('courses/:courseId/reviews')
export class CourseReviewsController {
  constructor(private readonly reviewsService: CourseReviewsService) { }

  // Público como el catálogo: las reseñas se ven sin login.
  @Get()
  @Public()
  @ApiOperation({ summary: 'Reseñas de un curso (paginadas) con promedio y distribución' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  findByCourse(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: ListCourseReviewsQuery,
  ) {
    return this.reviewsService.findByCourse(courseId, query.page, query.limit);
  }

  @Get('me')
  @ApiOperation({ summary: 'Mi reseña del curso y si puedo escribir una' })
  @ApiOkResponse({
    schema: { example: { canReview: true, reason: null, review: null } },
  })
  findMine(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reviewsService.findMine(courseId, userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Crear o editar mi reseña (requiere inscripción activa)' })
  @ApiResponse({ status: 403, description: 'No inscripto, o es el instructor del curso' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  upsertMine(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertCourseReviewDto,
  ) {
    return this.reviewsService.upsertMine(courseId, userId, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar mi reseña' })
  @ApiResponse({ status: 404, description: 'No tenés reseña en este curso' })
  removeMine(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reviewsService.removeMine(courseId, userId);
  }

}
