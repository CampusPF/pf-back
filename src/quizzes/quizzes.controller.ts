import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QuizzesService } from './quizzes.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { StudentQuizDto } from './dto/student-quiz.dto';
import { TeacherQuizDto } from './dto/teacher-quiz.dto';
import { CourseCheckpointDto } from './dto/course-checkpoint.dto';
import { QuizAttemptResultDto } from './dto/quiz-attempt-result.dto';

type AuthUser = { id: string; role: UserRole };

const NOT_OWNER = 'El curso no es tuyo (el ADMIN no edita contenido)';

/**
 * Checkpoints (quizzes) de un curso.
 *
 * El alumno rinde y ve su estado; la corrección es siempre server-side y
 * `isCorrect` sólo sale por las rutas del docente dueño.
 *
 * El JwtAuthGuard es global; RolesGuard no, así que las rutas del docente lo
 * aplican explícitamente. La titularidad del curso la valida el service.
 */
@ApiTags('quizzes')
@ApiBearerAuth()
@Controller()
export class QuizzesController {
    constructor(private readonly quizzesService: QuizzesService) { }

    // ─── Alumno ────────────────────────────────────────────────────────────

    @Get('courses/:courseId/quizzes')
    @ApiOperation({ summary: 'Checkpoints de un curso y si ya los aprobé' })
    @ApiOkResponse({ type: [CourseCheckpointDto] })
    findCourseCheckpoints(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.quizzesService.findCourseCheckpoints(courseId, userId);
    }

    @Get('quizzes/:quizId')
    @ApiOperation({ summary: 'Obtener un checkpoint para rendirlo (sin respuestas correctas)' })
    @ApiOkResponse({ type: StudentQuizDto })
    @ApiResponse({
        status: 403,
        description: 'Te faltan lecciones, no llegaste a este módulo, o agotaste los intentos',
    })
    @ApiResponse({ status: 404, description: 'No existe o no estás inscripto en el curso' })
    findForStudent(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.findForStudent(quizId, user);
    }

    @Post('quizzes/:quizId/attempts')
    @ApiOperation({ summary: 'Enviar mis respuestas y obtener el intento corregido' })
    @ApiResponse({ status: 201, type: QuizAttemptResultDto, description: 'Intento corregido' })
    @ApiResponse({ status: 400, description: 'Una respuesta no corresponde a este checkpoint' })
    @ApiResponse({
        status: 403,
        description: 'Te faltan lecciones, no llegaste a este módulo, o agotaste los intentos',
    })
    @ApiResponse({ status: 404, description: 'No existe o no estás inscripto en el curso' })
    submitAttempt(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @Body() dto: SubmitAttemptDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.submitAttempt(quizId, user, dto);
    }

    // ─── Docente dueño ─────────────────────────────────────────────────────

    @Post('quizzes')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @ApiOperation({ summary: 'Crear un checkpoint (de módulo o de fin de curso)' })
    @ApiResponse({ status: 201, type: TeacherQuizDto })
    @ApiResponse({ status: 400, description: 'Datos inválidos o el módulo no es de este curso' })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    @ApiResponse({ status: 409, description: 'Ese módulo (o el fin de curso) ya tiene un checkpoint' })
    create(@Body() dto: CreateQuizDto, @CurrentUser() user: AuthUser) {
        return this.quizzesService.create(dto, user);
    }

    @Get('courses/:courseId/quizzes/manage')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @ApiOperation({ summary: 'Todos los checkpoints de un curso para editarlos (con isCorrect, incluidos los vacíos)' })
    @ApiOkResponse({ type: [TeacherQuizDto] })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    @ApiResponse({ status: 404, description: 'Curso no encontrado' })
    findCourseQuizzesForTeacher(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.findCourseQuizzesForTeacher(courseId, user);
    }

    @Get('quizzes/:quizId/manage')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @ApiOperation({ summary: 'Ver un checkpoint para editarlo (con isCorrect)' })
    @ApiOkResponse({ type: TeacherQuizDto })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    @ApiResponse({ status: 404, description: 'Checkpoint no encontrado' })
    findForTeacher(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.findForTeacher(quizId, user);
    }

    @Patch('quizzes/:quizId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @ApiOperation({ summary: 'Editar título o puntaje mínimo de un checkpoint' })
    @ApiOkResponse({ type: TeacherQuizDto })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    @ApiResponse({ status: 404, description: 'Checkpoint no encontrado' })
    update(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @Body() dto: UpdateQuizDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.update(quizId, dto, user);
    }

    @Delete('quizzes/:quizId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar un checkpoint (con sus preguntas e intentos)' })
    @ApiResponse({ status: 204, description: 'Eliminado' })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    @ApiResponse({ status: 404, description: 'Checkpoint no encontrado' })
    remove(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.remove(quizId, user);
    }

    @Post('quizzes/:quizId/questions')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @ApiOperation({ summary: 'Agregar una pregunta a un checkpoint' })
    @ApiResponse({ status: 201, type: TeacherQuizDto })
    @ApiResponse({ status: 400, description: 'Menos de 2 opciones o no hay exactamente una correcta' })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    addQuestion(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @Body() dto: CreateQuestionDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.addQuestion(quizId, dto, user);
    }

    @Patch('quizzes/:quizId/questions/:questionId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @ApiOperation({ summary: 'Editar una pregunta (si se mandan opciones, reemplazan a las actuales)' })
    @ApiOkResponse({ type: TeacherQuizDto })
    @ApiResponse({ status: 400, description: 'Menos de 2 opciones o no hay exactamente una correcta' })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    @ApiResponse({ status: 404, description: 'Pregunta no encontrada en este checkpoint' })
    updateQuestion(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @Param('questionId', ParseUUIDPipe) questionId: string,
        @Body() dto: UpdateQuestionDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.updateQuestion(quizId, questionId, dto, user);
    }

    @Delete('quizzes/:quizId/questions/:questionId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER)
    @ApiOperation({ summary: 'Eliminar una pregunta de un checkpoint' })
    @ApiOkResponse({ type: TeacherQuizDto })
    @ApiResponse({ status: 403, description: NOT_OWNER })
    @ApiResponse({ status: 404, description: 'Pregunta no encontrada en este checkpoint' })
    removeQuestion(
        @Param('quizId', ParseUUIDPipe) quizId: string,
        @Param('questionId', ParseUUIDPipe) questionId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.quizzesService.removeQuestion(quizId, questionId, user);
    }
}
