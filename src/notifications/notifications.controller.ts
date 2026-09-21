import { Controller, Get, Header, HttpCode, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { RemindersService, RemindersRunResult } from './reminders.service';
import { UnsubscribeTokenService } from './unsubscribe-token.service';
import { frontendBaseUrl } from '../mail/mail-templates';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly reminders: RemindersService,
        private readonly unsubscribeTokens: UnsubscribeTokenService,
        private readonly config: ConfigService,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
    ) { }

    /**
     * Link "no quiero recibir más recordatorios" de los mails semanales.
     * Público (se abre desde el cliente de correo, sin sesión) y responde una
     * página HTML mínima en vez de JSON. Sólo apaga los recordatorios.
     */
    @Public()
    @Get('unsubscribe')
    @Header('Content-Type', 'text/html; charset=utf-8')
    @ApiOperation({ summary: 'Baja de los recordatorios por mail (link del mail)' })
    async unsubscribe(@Query('token') token: string): Promise<string> {
        const userId = this.unsubscribeTokens.verify(token ?? '');
        await this.usersRepository.update(userId, { emailRemindersEnabled: false });

        const home = frontendBaseUrl(this.config);
        return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja confirmada</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;color:#1f2937">
<h1 style="font-size:22px">Listo, no te vamos a mandar más recordatorios.</h1>
<p>Vas a seguir recibiendo los mails importantes de tu cuenta (compras, inscripciones, certificados).</p>
<p><a href="${home}" style="color:#4f46e5">Volver al Campus</a></p>
</body></html>`;
    }

    /** Dispara los recordatorios ya, sin esperar al cron. Para probar. */
    @Post('reminders/run')
    @HttpCode(200)
    @ApiBearerAuth()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Correr los recordatorios semanales ahora (admin)' })
    runReminders(): Promise<RemindersRunResult> {
        return this.reminders.runAll();
    }
}
