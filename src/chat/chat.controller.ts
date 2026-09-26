import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { Message } from './entities/message.entity';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Get(':otherUserId/messages')
    @ApiOperation({ summary: 'Obtener el historial de una conversación' })
    @ApiResponse({ status: 200, description: 'Historial ordenado del más antiguo al más reciente', type: Message, isArray: true })
    @ApiResponse({ status: 403, description: 'No se permite acceder a esta conversación' })
    @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
    getConversation(
        @Param('otherUserId', ParseUUIDPipe) otherUserId: string,
        @CurrentUser('id') userId: string,
    ): Promise<Message[]> {
        return this.chatService.getConversation(userId, otherUserId);
    }

    @Patch(':otherUserId/read')
    @ApiOperation({ summary: 'Marcar como leídos los mensajes recibidos de un usuario' })
    @ApiResponse({ status: 200, description: 'Cantidad de mensajes marcados como leídos' })
    @ApiResponse({ status: 403, description: 'No se permite acceder a esta conversación' })
    @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
    markConversationAsRead(
        @Param('otherUserId', ParseUUIDPipe) otherUserId: string,
        @CurrentUser('id') userId: string,
    ): Promise<number> {
        return this.chatService.markConversationAsRead(userId, otherUserId);
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Contar mis mensajes no leídos' })
    @ApiResponse({ status: 200, description: 'Cantidad de mensajes no leídos' })
    @ApiResponse({ status: 403, description: 'Los administradores no participan del chat' })
    @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
    getUnreadCount(@CurrentUser('id') userId: string): Promise<number> {
        return this.chatService.getUnreadCount(userId);
    }
}