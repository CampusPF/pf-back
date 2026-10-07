import { Body, Controller, Delete, Get, NotFoundException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RotatePushDto, SubscribePushDto, UnsubscribePushDto } from './dto/push-subscription.dto';
import { PushService } from './push.service';
import { CoursePushRemindersService, CoursePushRemindersRunResult } from './course-push-reminders.service';

@ApiTags('push')
@Controller('push')
export class PushController {
    constructor(
        private readonly pushService: PushService,
        private readonly config: ConfigService,
        private readonly coursePushReminders: CoursePushRemindersService,
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

    /**
     * La llama el service worker cuando el navegador rota la suscripción
     * (`pushsubscriptionchange`). Es `@Public` porque el SW corre sin sesión:
     * la fila se identifica por `oldEndpoint`, que es una URL secreta que sólo
     * conoce ese navegador. Sin fila previa no crea nada.
     */
    @Post('rotate')
    @Public()
    @ApiOperation({ summary: 'Mover una suscripción Web Push a un endpoint nuevo' })
    async rotate(@Body() body: RotatePushDto): Promise<{ rotated: boolean }> {
        return this.pushService.rotate(body.oldEndpoint, body);
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

    @Post('course-reminders/run')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Disparar recordatorios push de cursos (solo desarrollo)' })
    async runCourseReminders(): Promise<CoursePushRemindersRunResult> {
        if (this.config.get<string>('NODE_ENV') === 'production') {
            throw new NotFoundException();
        }
        return this.coursePushReminders.run();
    }
}