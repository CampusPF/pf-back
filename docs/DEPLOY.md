# Deploy a producción — checklist

Lo que hay que tener en cuenta al pasar a `main`. Escrito el 07/10/2026.

## 1. Migraciones (Supabase)

El proyecto **no usa `synchronize`** (está en `false` en `app.module.ts` y en
`data-source.ts`, en todos los entornos): las tablas las crean las migraciones
de `src/migrations/`. Las de todo lo nuevo ya están escritas:

| Migración | Crea |
|---|---|
| `1790726869805-AddPushSubscriptions` | `push_subscriptions` |
| `1790836796193-AddCoursePushReminders` | `course_push_reminders` |
| `1790900000000-AddForums` | `forum_categories`, `forum_threads`, `forum_posts` |

La campanita usa la tabla `notification` (en **singular**), que ya venía de
`1789645228343-CreateGamificationAndContentTables`.

**Cómo correrlas:** `npm run db:migrate` (`scripts/db-migrate.js`). Es JS plano
y sólo necesita `typeorm` + `pg`, así que anda en producción sin `ts-node`.
Requiere `dist/` compilado, o sea `npm run build` antes.

En Render va como **Pre-Deploy Command**:

```
npm run db:migrate
```

Si falla, Render aborta el deploy y la versión anterior sigue sirviendo.

### Un drift conocido que NO hay que aplicar

`npm run migration:generate` contra una base al día genera igual un archivo con
`ALTER TABLE ... DROP CONSTRAINT "FK_forum_threads_author"` y compañía. Es
cosmético: la migración `AddForums` creó las foreign keys con nombres
explícitos y las entidades no los declaran, así que TypeORM los ve como
distintos y propone renombrarlas a sus nombres autogenerados (`FK_ff0fa59...`).
No falta ninguna tabla ni columna. Si generás esa migración, borrala.

## 2. Variables de entorno

Las que validan como obligatorias en producción están en
`src/config/env.validation.ts` (`requiredInProd`): si falta una, el servicio no
arranca.

### Web Push (VAPID)

Ya configuradas en Render. **No las regeneres**: cambiarlas invalida de golpe
todas las suscripciones existentes (el servicio de push responde 401/403 y el
back borra esas filas). Con el handler de `pushsubscriptionchange` del service
worker la gente se re-suscribe sola al volver a entrar, pero igual perdés a
quien no vuelva.

`VAPID_SUBJECT` es el contacto que usan Google/Mozilla si hay un abuso: tiene
que ser una casilla que alguien del equipo lea.

### `CRON_SECRET` (nueva, opcional)

Habilita `POST /tasks/*` para el cron externo. Sin ella esos endpoints
responden **404** — no quedan abiertos ni existen. Generala con:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Cron externo

Los recordatorios se agendan con `CronJob` dentro del proceso de Nest. En un
plan que duerme por inactividad (Render free), a la hora programada puede no
haber proceso vivo y la corrida no ocurre, sin error ni log.

Por eso existe `src/tasks/`: endpoints que un cron externo dispara mandando el
secreto en el header `x-cron-secret`.

| Endpoint | Qué hace | Frecuencia sugerida |
|---|---|---|
| `POST /tasks/ping` | Nada. Despierta el servicio y sirve para probar el secreto. | — |
| `POST /tasks/course-push-reminders` | Push a alumnos con cursos inactivos. | 1 vez por día |
| `POST /tasks/weekly-reminders` | Mails semanales a alumnos y docentes inactivos. | 1 vez por semana |

Ejemplo con cron-job.org, GitHub Actions o el cron de Render:

```
curl -X POST https://<tu-back>/tasks/course-push-reminders \
     -H "x-cron-secret: $CRON_SECRET"
```

**Los crons internos quedan activos y no hay que apagarlos.** Las dos tareas
son idempotentes a propósito: los recordatorios por mail deduplican por semana
ISO y los push respetan `COURSE_PUSH_MIN_INTERVAL_DAYS`. Si llegan a correr dos
veces, nadie recibe nada repetido.

## 4. Después de deployar

- Logs del back: `PushService` ahora dice el motivo real de cada fallo
  (`Suscripción X descartada (HTTP 410)`, `Falló el envío push... (HTTP 400)`).
  Si aparecen descartes en masa, revisá que las VAPID no hayan cambiado.
- `SELECT count(*) FROM push_subscriptions;` — si está casi vacía, nadie activó
  las notificaciones todavía o se perdieron todas.
- Probar el cron una vez a mano con `/tasks/ping` antes de confiar en él.
