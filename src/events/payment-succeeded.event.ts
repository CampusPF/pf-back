/**
 * Stripe confirmó un pago y el acceso ya quedó activado (curso o suscripción).
 *
 * Se emite UNA vez por pago: en la transición pending → succeeded. Los
 * reintentos del webhook sobre un pago ya procesado no lo vuelven a emitir.
 */
export class PaymentSucceededEvent {
  constructor(public readonly paymentId: string) { }
}
