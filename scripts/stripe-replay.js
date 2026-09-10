/* eslint-disable */
/**
 * Reenvía al webhook local los `payment_intent.succeeded` que Stripe nunca
 * pudo entregar.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Stripe no puede alcanzar `localhost` desde internet. En desarrollo hace
 * falta un puente (`stripe listen --forward-to ...`) y, si no está corriendo,
 * pasa esto: el usuario paga, Stripe cobra, pero el backend nunca se entera.
 * El `Payment` queda en `pending` para siempre y la suscripción/inscripción
 * nunca se crea, así que el usuario pagó y no tiene acceso.
 *
 * Este script cierra ese hueco sin depender de instalar el CLI de Stripe.
 *
 * ── Qué hace, exactamente ─────────────────────────────────────────────────
 *   1. Busca en la base los Payment en estado `pending`.
 *   2. Le pregunta a STRIPE por cada PaymentIntent.
 *   3. SÓLO si Stripe responde `succeeded`, arma el evento y lo firma con
 *      STRIPE_WEBHOOK_SECRET (la misma firma que pondría Stripe) y lo POSTea
 *      al webhook local.
 *
 * El paso 3 es la garantía importante: **nunca inventa un cobro**. Si Stripe
 * dice que el pago no se completó, el script no lo toca. Es una herramienta de
 * recuperación, no una de "regalar acceso".
 *
 * El handler del back ya es idempotente (ver PaymentsService.handlePaymentSucceeded
 * y SubscriptionsService.activateFromPayment), así que correrlo dos veces no
 * duplica suscripciones ni inscripciones.
 *
 * ── Uso ───────────────────────────────────────────────────────────────────
 *   npm run stripe:replay            # reenvía
 *   npm run stripe:replay -- --dry-run   # sólo muestra qué haría
 *
 * En PRODUCCIÓN esto no debería hacer falta: hay que registrar el endpoint
 * https://<dominio>/payments/webhook en el Dashboard de Stripe y usar ESE
 * whsec_ en el .env. Si el endpoint está bien configurado, Stripe reintenta
 * solo durante ~3 días.
 */

require('dotenv').config();

const { Client } = require('pg');
const Stripe = require('stripe');

const DRY_RUN = process.argv.includes('--dry-run');

const WEBHOOK_URL =
  process.env.STRIPE_REPLAY_URL ??
  `http://localhost:${process.env.PORT ?? 4000}/payments/webhook`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta ${name} en el .env`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const secretKey = requireEnv('STRIPE_SECRET_KEY');
  const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');

  const stripe = new Stripe(secretKey);

  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await db.connect();

  const { rows: pending } = await db.query(`
    SELECT p.stripe_payment_intent_id AS pi, p.type, p.plan,
           p.amount_in_cents, u.email
    FROM payments p
    LEFT JOIN users u ON u.id = p."userId"
    WHERE p.status = 'pending'
    ORDER BY p.created_at ASC
  `);

  await db.end();

  if (pending.length === 0) {
    console.log('No hay pagos pendientes. Nada que reenviar.');
    return;
  }

  console.log(
    `${pending.length} pago(s) pendiente(s). Consultando el estado real en Stripe…\n`,
  );
  if (DRY_RUN) console.log('[--dry-run] no se va a enviar nada.\n');

  let replayed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of pending) {
    const label = `${row.email ?? 'sin usuario'} · ${row.type}${row.plan ? '/' + row.plan : ''} · $${row.amount_in_cents}`;

    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(row.pi);
    } catch (error) {
      console.log(`  ✗ ${label}\n      no se pudo leer de Stripe: ${error.message}`);
      failed++;
      continue;
    }

    if (intent.status !== 'succeeded') {
      // Lo normal acá es `requires_payment_method`: el usuario abrió el
      // checkout y no llegó a pagar. No hay nada que recuperar.
      console.log(`  – ${label}\n      Stripe dice "${intent.status}" → se ignora`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  → ${label}\n      Stripe dice "succeeded" → se reenviaría`);
      replayed++;
      continue;
    }

    // Envelope con la forma de un evento real. El handler sólo mira `type` y
    // `data.object`, pero se completa el resto para que sea indistinguible.
    const payload = JSON.stringify({
      id: `evt_replay_${Date.now()}_${intent.id.slice(-6)}`,
      object: 'event',
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: { object: intent },
      livemode: intent.livemode,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type: 'payment_intent.succeeded',
    });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': signature,
        },
        body: payload,
      });

      if (response.ok) {
        console.log(`  ✓ ${label}\n      reenviado y procesado (HTTP ${response.status})`);
        replayed++;
      } else {
        const body = await response.text();
        console.log(
          `  ✗ ${label}\n      el back respondió HTTP ${response.status}: ${body.slice(0, 200)}`,
        );
        failed++;
      }
    } catch (error) {
      console.log(
        `  ✗ ${label}\n      no se pudo contactar ${WEBHOOK_URL}: ${error.message}` +
          `\n      ¿está levantado el backend?`,
      );
      failed++;
    }
  }

  console.log(
    `\nResultado: ${replayed} reenviado(s), ${skipped} ignorado(s) (no se pagaron), ${failed} con error.`,
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Error inesperado:', error.message);
  process.exit(1);
});
