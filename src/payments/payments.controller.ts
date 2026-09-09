import {
    Controller,
    Post,
    Body,
    Req,
    Res,
    HttpCode,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { CreateIntentDto } from './dto/create-intent.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
    private readonly logger = new Logger(PaymentsController.name);

    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly stripeService: StripeService,
    ) { }

    @Post('create-intent')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Crear un PaymentIntent de Stripe para un curso o un plan',
        description: 'Body: { courseId } | { planId } (exactamente uno).',
    })
    @ApiResponse({ status: 200, description: '{ clientSecret } del PaymentIntent' })
    @ApiResponse({ status: 400, description: 'Curso/plan gratis, o body inválido' })
    @ApiResponse({ status: 409, description: 'Ya inscripto / ya suscripto' })
    createIntent(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateIntentDto,
    ) {
        return this.paymentsService.createIntent(userId, dto);
    }

    /**
     * Webhook de Stripe. @Public() porque Stripe no manda nuestro JWT; la
     * autenticidad se verifica con la firma (`stripe-signature` + el
     * STRIPE_WEBHOOK_SECRET) contra el body CRUDO.
     *
     * @SkipThrottle() para que una ráfaga de reintentos de Stripe no se coma
     * el rate limit por IP.
     *
     * Requiere `NestFactory.create(AppModule, { rawBody: true })` en main.ts
     * para que `req.rawBody` (Buffer con los bytes exactos) esté disponible.
     */
    @Public()
    @SkipThrottle()
    @Post('webhook')
    async handleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Res() res: Response,
    ): Promise<void> {
        const signature = req.headers['stripe-signature'];

        if (!req.rawBody || !signature) {
            res.status(HttpStatus.BAD_REQUEST).send('Falta el body crudo o la firma');
            return;
        }

        let event: Stripe.Event;
        try {
            event = this.stripeService.constructWebhookEvent(
                req.rawBody,
                Array.isArray(signature) ? signature[0] : signature,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'unknown';
            this.logger.warn(`Firma de webhook inválida: ${message}`);
            res.status(HttpStatus.BAD_REQUEST).send('Webhook signature verification failed');
            return;
        }

        try {
            if (event.type === 'payment_intent.succeeded') {
                await this.paymentsService.handlePaymentSucceeded(
                    event.data.object as Stripe.PaymentIntent,
                );
            }
        } catch (err) {
            // Si el procesamiento falla, devolvemos 500 a propósito: Stripe
            // reintenta el evento y el handler es idempotente.
            const message = err instanceof Error ? err.message : 'unknown';
            this.logger.error(`Error procesando ${event.type} (${event.id}): ${message}`);
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ received: false });
            return;
        }

        // 200 rápido: si no le llega, Stripe reintenta.
        res.status(HttpStatus.OK).send({ received: true });
    }
}
