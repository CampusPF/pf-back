import { HttpException } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    WsException,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { User, UserRole } from '../users/entities/user.entity';
import { ChatService } from './chat.service';

interface ChatAccessToken {
    sub: string;
}

@WebSocketGateway({
    namespace: '/chat',
    cors: {
        origin: (origin, callback) => {
            const allowedOrigins = (process.env.FRONTEND_URL ?? '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
            callback(null, !origin || allowedOrigins.includes(origin));
        },
        credentials: true,
    },
})
export class ChatGateway implements OnGatewayConnection {
    @WebSocketServer()
    private server: Server;

    constructor(
        private readonly jwtService: JwtService,
        private readonly chatService: ChatService,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
    ) { }

    /**
     * Al conectar:
     *  1. Verifica el JWT.
     *  2. Rechaza a los admins.
     *  3. Une al socket a la room de CADA conversación en la que participa.
     *
     * Rooms: `conversation:<conversationId>`. Cuando alguien manda un mensaje
     * a una conversación, se emite a esa room → lo reciben TODOS los
     * participantes conectados.
     */
    async handleConnection(client: Socket): Promise<void> {
        try {
            const token = this.getToken(client);
            if (!token) {
                client.disconnect(true);
                return;
            }

            const payload = await this.jwtService.verifyAsync<ChatAccessToken>(token);
            if (!isUUID(payload.sub)) {
                client.disconnect(true);
                return;
            }

            const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
            if (!user || user.role === UserRole.ADMIN) {
                client.disconnect(true);
                return;
            }

            client.data.userId = user.id;

            // Unir al socket a la room de cada conversación del user.
            const conversations = await this.chatService.getMyConversations(user.id);
            for (const conv of conversations) {
                await client.join(this.conversationRoom(conv.id));
            }
        } catch {
            client.disconnect(true);
        }
    }

    @SubscribeMessage('message:send')
    async sendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: unknown,
    ): Promise<void> {
        const userId = client.data.userId as string | undefined;
        if (!userId) throw new WsException('Autenticación requerida');

        if (typeof payload !== 'object' || payload === null) {
            throw new WsException('El mensaje debe incluir conversationId y content');
        }

        const body = payload as Record<string, unknown>;
        const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
        const content = body.content;
        if (!isUUID(conversationId) || typeof content !== 'string' || content.length === 0) {
            throw new WsException('conversationId debe ser un UUID y content un texto no vacío');
        }

        try {
            const message = await this.chatService.sendMessage(userId, conversationId, content);
            // Emitir a TODOS los participantes de la conversación.
            this.server
                .to(this.conversationRoom(conversationId))
                .emit('message:new', message);
        } catch (error) {
            if (error instanceof HttpException) throw new WsException(error.message);
            throw new WsException('No se pudo enviar el mensaje');
        }
    }

    private getToken(client: Socket): string | null {
        const authToken = client.handshake.auth?.token;
        if (typeof authToken === 'string') {
            return authToken.replace(/^Bearer\s+/i, '');
        }

        const authorization = client.handshake.headers.authorization;
        if (typeof authorization === 'string' && /^Bearer\s+/i.test(authorization)) {
            return authorization.replace(/^Bearer\s+/i, '');
        }
        return null;
    }

    private conversationRoom(conversationId: string): string {
        return `conversation:${conversationId}`;
    }
}
