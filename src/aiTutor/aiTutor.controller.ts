import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiTutorService } from './aiTutor.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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

@ApiTags('ai-tutor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-tutor')
export class AiTutorController {
    constructor(private readonly aiTutorService: AiTutorService) { }

    @Post('conversations')
    @ApiOperation({ summary: 'Crear conversación para una lección' })
    @ApiResponse({ status: 201, description: 'Conversación creada correctamente' })
    createConversation(
        @Body() dto: CreateConversationDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.aiTutorService.createConversation(dto, userId);
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
    findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.aiTutorService.findOne(id, userId);
    }

    @Post('conversations/:id/messages')
    @ApiOperation({ summary: 'Enviar mensaje y recibir respuesta del tutor IA' })
    @ApiResponse({ status: 400, description: 'Límite diario de mensajes alcanzado' })
    @ApiResponse({ status: 429, description: 'Demasiados mensajes en poco tiempo' })
    @Throttle({ default: { limit: AI_THROTTLE_LIMIT, ttl: AI_THROTTLE_TTL_MS } })
    sendMessage(
        @Param('id') id: string,
        @Body() dto: CreateMessageDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.aiTutorService.sendMessage(id, dto, userId);
    }

    @Delete('conversations/:id')
    @ApiOperation({ summary: 'Borrar una conversación' })
    remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
        return this.aiTutorService.remove(id, userId);
    }

    @Get('usage/me')
    @ApiOperation({ summary: 'Cuántos mensajes usé hoy (relevante para plan Free)' })
    getUsage(@CurrentUser('id') userId: string) {
        return this.aiTutorService.getUsageToday(userId);
    }
}