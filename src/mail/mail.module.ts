import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Sin controllers: no hay ningún endpoint que mande mails directamente. Cada
 * módulo de dominio importa este y llama a MailService.send() cuando le toca
 * (hoy sólo auth, para recuperar contraseña).
 */
@Module({
    providers: [MailService],
    exports: [MailService],
})
export class MailModule { }
