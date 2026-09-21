import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CourseProgressionService } from './course-progression.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CourseProgressionDto } from './dto/course-progression.dto';

/**
 * Estado de la progresión secuencial de un curso para el usuario logueado.
 *
 * Es lo que el front usa para dibujar los candados. NO es el control de
 * acceso: ese lo aplican igual LessonsController y QuizzesService, así que
 * saltearse esta llamada no habilita nada.
 */
@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CourseProgressionController {
    constructor(private readonly progression: CourseProgressionService) { }

    @Get(':courseId/progression')
    @ApiOperation({
        summary: 'Qué módulos y checkpoints tengo desbloqueados en este curso',
    })
    @ApiOkResponse({ type: CourseProgressionDto })
    getProgression(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: { id: string; role: UserRole },
    ) {
        return this.progression.getProgression(user, courseId);
    }
}
