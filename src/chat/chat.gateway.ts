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
            await client.join(this.userRoom(user.id));
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
            throw new WsException('El mensaje debe incluir receiverId y content');
        }

        const body = payload as Record<string, unknown>;
        const receiverId = typeof body.receiverId === 'string' ? body.receiverId : '';
        const content = body.content;
        if (!isUUID(receiverId) || typeof content !== 'string' || content.length === 0) {
            throw new WsException('receiverId debe ser un UUID y content un texto no vacío');
        }

        try {
            const message = await this.chatService.sendMessage(userId, receiverId, content);
            this.server
                .to(this.userRoom(userId))
                .to(this.userRoom(receiverId))
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

    private userRoom(userId: string): string {
        return `user:${userId}`;
    }
}