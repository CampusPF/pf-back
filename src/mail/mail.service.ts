import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

/**
 * Único punto de salida de mails de la app. Todo lo que mande correo
 * (recuperar contraseña hoy; bienvenida, inscripción, certificado mañana)
 * llama a `send()` y no sabe nada de Brevo.
 *
 * BREVO_API_KEY es `requiredInProd`: en desarrollo la app levanta igual sin
 * ella. Mismo criterio que StripeService y CloudinaryService.
 *
 * OJO con la versión del SDK: `@getbrevo/brevo` v6 rehízo la API. Los
 * ejemplos que se encuentran dando vueltas (`new TransactionalEmailsApi()`,
 * `setApiKey(...)`, `new SendSmtpEmail()`) son de la v2/v3 y ya no existen —
 * acá se usa `new BrevoClient({ apiKey })` +
 * `client.transactionalEmails.sendTransacEmail({...})`.
 */
@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly client: BrevoClient | null;
    private readonly isProduction: boolean;
    /** true = se llama a Brevo de verdad (producción, o MAIL_FORCE_SEND). */
    private readonly deliveryEnabled: boolean;

    constructor(private readonly config: ConfigService) {
        this.isProduction = config.get<string>('NODE_ENV') === 'production';
        this.deliveryEnabled =
            this.isProduction || config.get<boolean>('MAIL_FORCE_SEND') === true;

        const apiKey = config.get<string>('BREVO_API_KEY');

        if (!apiKey) {
            // En dev es esperable y no molesta: `send()` ni siquiera llega a
            // usar el cliente (loguea y corta antes).
            if (this.isProduction) {
                this.logger.error(
                    'BREVO_API_KEY no configurada: NO se va a poder enviar ningún mail.',
                );
            } else {
                this.logger.warn(
                    'BREVO_API_KEY no configurada: los mails se van a loguear por consola.',
                );
            }
            this.client = null;
            return;
        }

        this.client = new BrevoClient({ apiKey });
    }

    /**
     * Manda un mail transaccional.
     *
     * FUERA de producción no llama a Brevo (salvo MAIL_FORCE_SEND=true):
     * escribe el mail en el log y vuelve. Son dos motivos: no quemar los 300 mails/día del plan gratuito
     * probando en local, y que los tests no dependan de la red.
     *
     * Lanza si Brevo falla. Quien llame decide qué hacer con eso — en el caso
     * de "recuperar contraseña" el error se loguea y se traga a propósito,
     * para no bloquear la respuesta al usuario (ver AuthService.forgotPassword).
     */
    async send(to: string, subject: string, html: string): Promise<void> {
        if (!this.deliveryEnabled) {
            this.logger.log(
                `[DEV] Mail NO enviado (se enviaría a ${to})\n` +
                `  Asunto: ${subject}\n` +
                `  HTML:\n${html}`,
            );
            return;
        }

        await this.requireClient().transactionalEmails.sendTransacEmail({
            to: [{ email: to }],
            sender: this.sender(),
            subject,
            htmlContent: html,
        });
    }

    /**
     * Manda un mail usando una plantilla de Brevo (diseñada en Stripo).
     *
     * El asunto y el HTML viven en la plantilla; acá sólo viajan los datos
     * (`params`), que la plantilla lee como `{{ params.nombre }}`. Así el
     * diseño se cambia en Brevo/Stripo sin tocar ni redeployar el back.
     *
     * `tags` sirve para filtrar los logs y las estadísticas en Brevo por tipo
     * de mail. Mismo corte de dev y mismo manejo de errores que `send()`.
     */
    async sendTemplate(
        to: { email: string; name?: string },
        templateId: number,
        params: Record<string, unknown>,
        tags: string[] = [],
    ): Promise<void> {
        if (!this.deliveryEnabled) {
            this.logger.log(
                `[DEV] Mail NO enviado (se enviaría a ${to.email})\n` +
                `  Plantilla: ${templateId}  Tags: ${tags.join(', ') || '-'}\n` +
                `  Params: ${JSON.stringify(params, null, 2)}`,
            );
            return;
        }

        if (!templateId) {
            throw new ServiceUnavailableException(
                `Plantilla de mail no configurada (tags: ${tags.join(', ')}).`,
            );
        }

        await this.requireClient().transactionalEmails.sendTransacEmail({
            to: [to.name ? { email: to.email, name: to.name } : { email: to.email }],
            sender: this.sender(),
            templateId,
            params,
            tags,
        });
    }

    private requireClient(): BrevoClient {
        if (!this.client) {
            throw new ServiceUnavailableException(
                'Servicio de mails no configurado (falta BREVO_API_KEY).',
            );
        }
        return this.client;
    }

    private sender(): { email: string; name: string } {
        return {
            // Tiene que ser EXACTAMENTE un remitente verificado en Brevo;
            // si no, la API responde 403 y el mail no sale.
            email: this.config.getOrThrow<string>('MAIL_FROM_ADDRESS'),
            name: this.config.get<string>('MAIL_FROM_NAME') ?? 'Campus',
        };
    }
}
