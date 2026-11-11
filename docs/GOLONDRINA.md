# Golondrina: avisos reales desde el asistente de cada lección

Back del prototipo del front (pf-front, PR #60): las acciones de un clic de la
pestaña **Golondrina** del tutor ahora se guardan y se mandan de verdad.

| Acción | Qué hace | Cuándo sale |
| --- | --- | --- |
| `recordar` | «Hoy toca repasar ‹lección›» | Mañana a las 19:00 (Argentina) |
| `plan` | Un bloque de estudio: releer, practicar con el tutor, quiz | 18:45, tres veces cada 48 h, desde mañana |
| `resumen` | Los puntos clave de la lección (títulos de sección o primeras oraciones) | En el momento |
| `docente` | «Te respondió el docente» | Cuando el instructor del curso le escribe por el chat o le responde en el foro |

**Canales:** `push` (celular, Web Push ya existente), `email` (Brevo, plantilla
`golondrina`) e `in_app` (campanita). Si eligió `push` pero no tiene ningún
navegador suscripto, el aviso cae en la campanita.

**Acceso:** activar una acción exige el mismo acceso que el contenido de la
lección (`LessonsAccessService`): no es una forma gratis de recibir el resumen
de una lección paga.

## API (con sesión)

| Método | Ruta | Para qué |
| --- | --- | --- |
| GET | `/golondrina/me/channels` | `{ push, email, in_app }`: por dónde le pueden llegar |
| GET | `/golondrina/me/automations?lessonId=` | Sus automatizaciones (no canceladas) |
| POST | `/golondrina/me/automations` | `{ lessonId, action, channel }`. Si ya existía la reprograma. `resumen` vuelve con `status: done` y `deliveredVia` |
| PATCH | `/golondrina/me/automations/:id` | `{ channel }` |
| DELETE | `/golondrina/me/automations/:id` | La apaga (204) |

## Programación

- Cron interno cada 5 minutos (`GOLONDRINA_CRON`, en UTC).
- Disparador externo `POST /tasks/golondrina` con el header `x-cron-secret`
  (igual que los otros de `TasksController`). En Render free conviene
  agregarlo en cron-job.org cada 10 minutos: el servicio duerme y el cron
  interno no corre.
- Cada aviso se «reclama» antes de mandarse (`FOR UPDATE SKIP LOCKED`), así
  que el cron interno y el externo pueden coincidir sin duplicar nada. Si un
  envío falla, se reintenta a los 15 minutos sin gastar la corrida.

## Cambios fuera del módulo

- Migración `1791100000000-AddGolondrinaAutomations` (tabla `golondrina_automations`).
- `ChatService.sendMessage` emite `chat.message-sent` (nuevo `ChatMessageSentEvent`).
- `PushService.canReach(userId)`: hay VAPID y al menos una suscripción.
- `NotificationsModule` exporta `EmailNotificationsService` (registro
  anti-duplicados de los mails).
- Plantilla de mail `golondrina` y su ejemplo en `templates.fixtures.ts`.

## Tests

`src/golondrina/*.spec.ts`: horarios en hora argentina, plan cada 48 h,
reintento, resumen, acceso, reprogramación sin duplicar, push que cae en la
campanita y aviso del docente. Con Nest 12 los tests necesitan Node 24
(`npx -y node@24 --experimental-vm-modules node_modules/jest/bin/jest.js`).
