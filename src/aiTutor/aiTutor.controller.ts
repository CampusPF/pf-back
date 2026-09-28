import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Query,
    Res,
    UseGuards,
    Logger,
    ParseUUIDPipe,
    HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProduces, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { AiTutorService } from './aiTutor.service';
import type { TutorActor } from './aiTutor.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Throttle } from '@nestjs/throttler';

// Cada mensaje al tutor cuesta una llamada al proveedor de IA (= plata) y es
// el endpoint más caro de la API. El UserOrIpThrottlerGuard cuenta por usuario
// acá, porque la ruta está autenticada.
// Esto es complementario, no redundante, con el límite diario del plan Free
// que aplica AiTutorService: aquel controla el volumen por día, este el ritmo.
// Se leen como función para que se resuelvan en cada request, con el .env ya
// cargado, y no al evaluarse el decorador.
const AI_THROTTLE_LIMIT = () => Number(process.env.THROTTLE_AI_LIMIT ?? 20);
const AI_THROTTLE_TTL_MS = () => Number(process.env.THROTTLE_TTL ?? 60) * 1000;

// Todo el controller exige login: sin token no hay tutor.
@ApiTags('ai-tutor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-tutor')
export class AiTutorController {
    private readonly logger = new Logger(AiTutorController.name);

    constructor(private readonly aiTutorService: AiTutorService) { }

    @Get('lessons/:lessonId/conversation')
    @ApiOperation({ summary: 'Última conversación del alumno en esta lección: { conversation } (null si no hay)' })
    @ApiResponse({ status: 403, description: 'No tenés acceso a la lección' })
    findLatestForLesson(
        @Param('lessonId', ParseUUIDPipe) lessonId: string,
        @CurrentUser() user: TutorActor,
    ) {
        return this.aiTutorService.findLatestForLesson(lessonId, user);
    }

    @Post('conversations')
    @ApiOperation({ summary: 'Nueva conversación para una lección (botón "Nueva conversación")' })
    @ApiResponse({ status: 201, description: 'Conversación creada correctamente' })
    @ApiResponse({ status: 403, description: 'No tenés acceso a la lección' })
    createConversation(
        @Body() dto: CreateConversationDto,
        @CurrentUser() user: TutorActor,
    ) {
        return this.aiTutorService.createConversation(dto.lessonId, user);
    }

    @Get('suggested-questions')
    @ApiOperation({ summary: 'Obtener preguntas sugeridas para el tutor' })
    @ApiResponse({ status: 200, description: 'Lista de preguntas sugeridas' })
    getSuggestedQuestions() {
        return this.aiTutorService.getSuggestedQuestions();
    }

    @Get('conversations')
    @ApiOperation({ summary: 'Listar mis conversaciones' })
    findAllMine(@CurrentUser('id') userId: string) {
        return this.aiTutorService.findAllByUser(userId);
    }

    @Get('conversations/:id')
    @ApiOperation({ summary: 'Obtener historial completo de una conversación' })
    @ApiResponse({ status: 404, description: 'Conversación no encontrada' })
    @ApiResponse({ status: 403, description: 'La conversación no te pertenece' })
    findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
        return this.aiTutorService.findOne(id, userId);
    }

    /**
     * Respuesta en streaming (Server-Sent Events). Es POST porque lleva body
     * y token, así que el front lo consume con fetch + response.body.getReader()
     * (EventSource sólo sirve para GET y no manda el header Authorization).
     *
     * Eventos:
     *   event: token → data: {"text":"pedacito"}
     *   event: done  → data: {"messageId":"...","userMessageId":"..."}
     *   event: error → data: {"message":"..."}
     *
     * Los errores de validación, acceso o límite diario llegan como un error
     * HTTP normal (JSON), porque ocurren antes de abrir el stream.
     */
    @Post('conversations/:id/messages')
    @HttpCode(200)
    @ApiOperation({ summary: 'Enviar mensaje (texto o acción rápida) y recibir la respuesta en streaming (SSE)' })
    @ApiProduces('text/event-stream')
    @ApiResponse({ status: 429, description: 'Límite diario del plan gratis (code AI_DAILY_LIMIT_REACHED) o demasiados mensajes seguidos' })
    @ApiResponse({ status: 503, description: 'No hay proveedor de IA configurado' })
    @Throttle({ default: { limit: AI_THROTTLE_LIMIT, ttl: AI_THROTTLE_TTL_MS } })
    async sendMessage(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateMessageDto,
        @CurrentUser() user: TutorActor,
        @Res() res: Response,
    ): Promise<void> {
        // Si esto tira, Nest responde el error HTTP de siempre.
        const turn = await this.aiTutorService.prepareTurn(id, dto, user);

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // que Nginx/Railway no bufferee
        res.flushHeaders();

        const send = (event: string, data: unknown) =>
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

        // Si el alumno cierra el chat o la pestaña, se corta la llamada a la
        // IA para no seguir gastando tokens.
        const abort = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) abort.abort();
        });

        try {
            for await (const event of this.aiTutorService.streamReply(turn, abort.signal)) {
                if (event.type === 'token') send('token', { text: event.text });
                else send('done', { messageId: event.messageId, userMessageId: turn.userMessage.id });
            }
        } catch (error) {
            if (!abort.signal.aborted) {
                this.logger.error(`Falló la respuesta del tutor: ${(error as Error).message}`);
                send('error', { message: 'El tutor no pudo responder. Probá de nuevo en unos segundos.' });
            }
        } finally {
            res.end();
        }
    }

    @Delete('conversations/:id')
    @ApiOperation({ summary: 'Borrar una conversación' })
    remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
        return this.aiTutorService.remove(id, userId);
    }

    @Get('usage/me')
    @ApiOperation({ summary: 'Cuántos mensajes usé hoy (relevante para plan Free)' })
    getUsage(@CurrentUser('id') userId: string) {
        return this.aiTutorService.getUsageToday(userId);
    }

    @Get('stats/lessons')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER, UserRole.ADMIN)
    @ApiOperation({ summary: 'Lecciones donde más se le pregunta al tutor (docente: sus cursos; admin: todos)' })
    @ApiQuery({ name: 'courseId', required: false })
    getLessonStats(
        @CurrentUser() user: TutorActor,
        @Query('courseId', new ParseUUIDPipe({ optional: true })) courseId?: string,
    ) {
        return this.aiTutorService.getLessonStats(user, courseId);
    }
}
