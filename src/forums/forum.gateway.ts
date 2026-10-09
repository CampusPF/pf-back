import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { ForumsService } from './forums.service';
import { EVENTS, ForumThreadChangedEvent } from '../events';

interface ForumAccessToken {
    sub: string;
    role: string;
}

/**
 * Namespace propio ('/forums'), separado del '/chat': no comparten sockets
 * ni rooms, así que esto no toca nada del chat en vivo.
 *
 * No hay "escribir" por acá: todas las escrituras siguen siendo REST
 * (ForumsController). Este gateway sólo reenvía una señal de "este hilo
 * cambió" a quien lo tenga abierto, para que pida el estado fresco por REST
 * — ver ForumThreadChangedEvent. Mantiene al mínimo lo que viaja por
 * WebSocket y evita duplicar la lógica de permisos/moderación del REST.
 */
@WebSocketGateway({
    namespace: '/forums',
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
export class ForumGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    private server: Server;

    constructor(
        private readonly jwtService: JwtService,
        private readonly forums: ForumsService,
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

            const payload = await this.jwtService.verifyAsync<ForumAccessToken>(token);
            if (!isUUID(payload.sub)) {
                client.disconnect(true);
                return;
            }

            const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
            // Igual que ChatGateway: el handshake no pasa por JwtStrategy, así
            // que el chequeo de cuenta activa hay que repetirlo acá.
            if (!user || user.status !== UserStatus.ACTIVE) {
                client.disconnect(true);
                return;
            }

            client.data.userId = user.id;
            client.data.userRole = user.role;
        } catch {
            client.disconnect(true);
        }
    }

    handleDisconnect(): void {
        // Nada que limpiar: las rooms de thread:* las suelta socket.io solo
        // al desconectar, no hay estado propio como el de ChatGateway.
    }

    /**
     * Se une a la room del hilo, sólo si puede leerlo (misma regla que el
     * REST). Devuelve `{ joined }` como ack: el front hoy no lo necesita
     * (si no se puede unir, simplemente no llegan avisos de ese hilo, que es
     * un degradado silencioso razonable), pero sirve para depurar.
     */
    @SubscribeMessage('thread:join')
    async joinThread(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: unknown,
    ): Promise<{ joined: boolean }> {
        const userId = client.data.userId as string | undefined;
        const userRole = client.data.userRole as string | undefined;
        const threadId = this.readThreadId(payload);
        if (!userId || !threadId) return { joined: false };

        const canRead = await this.forums.canReadThread({ id: userId, role: userRole as UserRole }, threadId);
        if (!canRead) return { joined: false };

        await client.join(this.threadRoom(threadId));
        return { joined: true };
    }

    @SubscribeMessage('thread:leave')
    async leaveThread(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: unknown,
    ): Promise<void> {
        const threadId = this.readThreadId(payload);
        if (!threadId) return;
        await client.leave(this.threadRoom(threadId));
    }

    /** Alguien escribió/editó/borró algo en el hilo: avisa a quien lo tenga abierto. */
    @OnEvent(EVENTS.FORUM_THREAD_CHANGED, { async: true })
    onThreadChanged(event: ForumThreadChangedEvent): void {
        this.server.to(this.threadRoom(event.threadId)).emit('thread:changed', { threadId: event.threadId });
    }

    private readThreadId(payload: unknown): string | null {
        if (typeof payload !== 'object' || payload === null) return null;
        const threadId = (payload as Record<string, unknown>).threadId;
        return typeof threadId === 'string' && isUUID(threadId) ? threadId : null;
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

    private threadRoom(threadId: string): string {
        return `thread:${threadId}`;
    }
}
