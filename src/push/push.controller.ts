import { Body, Controller, Delete, Get, NotFoundException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push-subscription.dto';
import { PushService } from './push.service';

@ApiTags('push')
@Controller('push')
export class PushController {
    constructor(
        private readonly pushService: PushService,
        private readonly config: ConfigService,
    ) { }

    @Post('subscribe')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Registrar una suscripción Web Push' })
    async subscribe(
        @CurrentUser('id') userId: string,
        @Body() body: SubscribePushDto,
    ): Promise<void> {
        await this.pushService.subscribe(userId, body);
    }

    @Delete('unsubscribe')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Eliminar una suscripción Web Push' })
    async unsubscribe(
        @Body() body: UnsubscribePushDto,
    ): Promise<{ removed: number }> {
        return { removed: await this.pushService.unsubscribe(body.endpoint) };
    }

    @Get('public-key')
    @Public()
    @ApiOperation({ summary: 'Obtener la clave pública VAPID' })
    getPublicKey(): { publicKey: string } {
        return { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') ?? '' };
    }

    @Post('test')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Enviar una notificación de prueba (solo desarrollo)' })
    async sendTest(@CurrentUser('id') userId: string): Promise<{ sent: boolean }> {
        if (this.config.get<string>('NODE_ENV') === 'production') {
            throw new NotFoundException();
        }
        return this.pushService.sendTestToUser(userId);
    }

    @Post('cleanup')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Limpiar suscripciones inválidas (solo desarrollo)' })
    async cleanup(): Promise<{ checked: number; removed: number }> {
        if (this.config.get<string>('NODE_ENV') === 'production') {
            throw new NotFoundException();
        }
        return this.pushService.cleanupSubscriptionsForDevelopment();
    }
}