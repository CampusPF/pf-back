import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

/**
 * El foco acá es el webhook: sin firma válida no se toca nada, y solo el
 * evento payment_intent.succeeded dispara el procesamiento del pago.
 */

function makeController() {
    const handlePaymentSucceeded = jest.fn(async () => undefined);
    const paymentsService = { handlePaymentSucceeded } as unknown as PaymentsService;

    const constructWebhookEvent = jest.fn();
    const stripeService = { constructWebhookEvent } as unknown as StripeService;

    const controller = new PaymentsController(paymentsService, stripeService);

    const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
    };

    return { controller, res, handlePaymentSucceeded, constructWebhookEvent };
}

const rawBody = Buffer.from(JSON.stringify({ id: 'evt_1' }));

describe('PaymentsController.handleWebhook', () => {
    it('firma inválida → 400 y NO procesa el pago', async () => {
        const { controller, res, constructWebhookEvent, handlePaymentSucceeded } =
            makeController();
        constructWebhookEvent.mockImplementation(() => {
            throw new Error('No signatures found matching the expected signature');
        });

        await controller.handleWebhook(
            { headers: { 'stripe-signature': 'bad' }, rawBody } as any,
            res as any,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(handlePaymentSucceeded).not.toHaveBeenCalled();
    });

    it('sin body crudo o sin firma → 400', async () => {
        const { controller, res, constructWebhookEvent } = makeController();

        await controller.handleWebhook(
            { headers: {}, rawBody: undefined } as any,
            res as any,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(constructWebhookEvent).not.toHaveBeenCalled();
    });

    it('firma válida + payment_intent.succeeded → procesa y responde 200', async () => {
        const { controller, res, constructWebhookEvent, handlePaymentSucceeded } =
            makeController();
        const paymentIntent = { id: 'pi_1', amount_received: 4999 };
        constructWebhookEvent.mockReturnValue({
            id: 'evt_1',
            type: 'payment_intent.succeeded',
            data: { object: paymentIntent },
        });

        await controller.handleWebhook(
            { headers: { 'stripe-signature': 'ok' }, rawBody } as any,
            res as any,
        );

        expect(handlePaymentSucceeded).toHaveBeenCalledWith(paymentIntent);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('firma válida pero otro tipo de evento → 200 sin procesar pago', async () => {
        const { controller, res, constructWebhookEvent, handlePaymentSucceeded } =
            makeController();
        constructWebhookEvent.mockReturnValue({
            id: 'evt_2',
            type: 'payment_intent.payment_failed',
            data: { object: { id: 'pi_2' } },
        });

        await controller.handleWebhook(
            { headers: { 'stripe-signature': 'ok' }, rawBody } as any,
            res as any,
        );

        expect(handlePaymentSucceeded).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('el handler falla → 500 (Stripe reintenta)', async () => {
        const { controller, res, constructWebhookEvent, handlePaymentSucceeded } =
            makeController();
        constructWebhookEvent.mockReturnValue({
            id: 'evt_3',
            type: 'payment_intent.succeeded',
            data: { object: { id: 'pi_3' } },
        });
        handlePaymentSucceeded.mockRejectedValueOnce(new Error('DB down'));

        await controller.handleWebhook(
            { headers: { 'stripe-signature': 'ok' }, rawBody } as any,
            res as any,
        );

        expect(res.status).toHaveBeenCalledWith(500);
    });
});
