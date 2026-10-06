import { HttpException } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
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
import { User, UserStatus } from '../users/entities/user.entity';
import { ChatService } from './chat.service';
import { Message } from './entities/message.entity';
import { PushService } from '../push/push.service';

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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    private server: Server;

    constructor(
        private readonly jwtService: JwtService,
        private readonly chatService: ChatService,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        private readonly pushService: PushService,
    ) { }

    private readonly focusedConversations = new Map<string, string>();
    private readonly typingTo = new Map<string, string>();
    private readonly typingTimers = new Map<string, NodeJS.Timeout>();

    handleDisconnect(client: Socket): void {
        this.focusedConversations.delete(client.id);

        const socketUserId = typeof client.data.userId === 'string' ? client.data.userId : null;
        const receiverId = this.typingTo.get(client.id);
        const timer = this.typingTimers.get(client.id);

        if (timer) {
            clearTimeout(timer);
            this.typingTimers.delete(client.id);
        }

        if (receiverId && socketUserId) {
            this.server.to(this.userRoom(receiverId)).emit('typing:update', { senderId: socketUserId, isTyping: false });
            this.typingTo.delete(client.id);
        }
    }

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
            // El handshake no pasa por JwtStrategy: el chequeo de cuenta
            // activa tiene que estar también acá, o una cuenta dada de baja
            // seguiría chateando con su token. Los admins entran (chatean con
            // docentes); qué pares pueden hablar lo decide ChatService.
            if (!user || user.status !== UserStatus.ACTIVE) {
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
    ): Promise<Message> {
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
            const recipientIsViewing = [...this.focusedConversations].some(
                ([socketId, otherUserId]) =>
                    this.server.sockets.sockets.get(socketId)?.data.userId === receiverId &&
                    otherUserId === userId,
            );
            if (!recipientIsViewing) {
                const conversationId = `direct-${userId}`;
                const [sender, unread] = await Promise.all([
                    this.usersRepository.findOne({ where: { id: userId }, select: { name: true } }),
                    this.chatService.countUnreadFromSender(receiverId, userId),
                ]);
                const senderName = sender?.name ?? 'Alguien';
                void this.pushService.sendToUser(receiverId, {
                    title: unread > 1
                        ? `Nuevo mensaje recibido (${unread})`
                        : 'Nuevo mensaje recibido',
                    body: `${senderName}: ${message.content.slice(0, 120)}`,
                    url: `/dashboard/chats?conversation=${conversationId}`,
                    tag: `chat-${conversationId}`,
                    icon: '/logo-campus.png',
                }).catch(() => undefined);
            }
            // Nest manda este valor como ack de vuelta a quien envió: así el
            // front confirma el envío (y obtiene el id/createdAt reales) sin
            // depender sólo del 'message:new' que ya recibió por el emit.
            return message;
        } catch (error) {
            if (error instanceof HttpException) throw new WsException(error.message);
            throw new WsException('No se pudo enviar el mensaje');
        }
    }

    @SubscribeMessage('chat:focus')
    focusConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: unknown,
    ): void {
        const otherUserId = this.readOtherUserId(payload);
        if (!otherUserId || !client.data.userId) return;
        this.focusedConversations.set(client.id, otherUserId);
    }

    @SubscribeMessage('chat:blur')
    blurConversation(@ConnectedSocket() client: Socket): void {
        this.focusedConversations.delete(client.id);
    }

    @SubscribeMessage('typing:update')
    async updateTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: unknown,
    ): Promise<void> {
        const userId = client.data.userId as string | undefined;
        if (!userId) return;

        if (typeof payload !== 'object' || payload === null) return;

        const body = payload as Record<string, unknown>;
        const receiverId = typeof body.receiverId === 'string' ? body.receiverId : '';
        const isTyping = typeof body.isTyping === 'boolean' ? body.isTyping : null;

        if (!isUUID(receiverId) || isTyping === null) return;

        try {
            await this.chatService.getConversation(userId, receiverId);
        } catch {
            return;
        }

        const socketId = client.id;
        const currentReceiver = this.typingTo.get(socketId);

        if (isTyping) {
            if (currentReceiver === receiverId) {
                const timer = this.typingTimers.get(socketId);
                if (timer) {
                    clearTimeout(timer);
                }
                const nextTimer = setTimeout(() => {
                    const activeReceiver = this.typingTo.get(socketId);
                    if (!activeReceiver) return;
                    this.server.to(this.userRoom(activeReceiver)).emit('typing:update', {
                        senderId: userId,
                        isTyping: false,
                    });
                    this.typingTo.delete(socketId);
                    this.typingTimers.delete(socketId);
                }, 5000);
                this.typingTimers.set(socketId, nextTimer);
                return;
            }

            this.server.to(this.userRoom(receiverId)).emit('typing:update', { senderId: userId, isTyping: true });
            this.typingTo.set(socketId, receiverId);

            const existingTimer = this.typingTimers.get(socketId);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            const nextTimer = setTimeout(() => {
                const activeReceiver = this.typingTo.get(socketId);
                if (!activeReceiver) return;
                this.server.to(this.userRoom(activeReceiver)).emit('typing:update', {
                    senderId: userId,
                    isTyping: false,
                });
                this.typingTo.delete(socketId);
                this.typingTimers.delete(socketId);
            }, 5000);
            this.typingTimers.set(socketId, nextTimer);
            return;
        }

        const timer = this.typingTimers.get(socketId);
        if (timer) {
            clearTimeout(timer);
            this.typingTimers.delete(socketId);
        }

        this.server.to(this.userRoom(receiverId)).emit('typing:update', { senderId: userId, isTyping: false });
        this.typingTo.delete(socketId);
    }

    private readOtherUserId(payload: unknown): string | null {
        if (typeof payload !== 'object' || payload === null) return null;
        const otherUserId = (payload as Record<string, unknown>).otherUserId;
        return typeof otherUserId === 'string' && isUUID(otherUserId) ? otherUserId : null;
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