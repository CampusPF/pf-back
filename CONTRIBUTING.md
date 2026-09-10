# Cómo contribuir a Campus Lite (backend)

Esta guía es para el equipo. Si es tu primera vez colaborando en un repo de
Git con varias personas, seguí los pasos en orden — no hace falta que
entiendas todo Git para poder laburar bien, solo estos comandos.

## Las dos ramas que importan

- **`main`** → es lo que está deployado en producción (Render). Nadie pushea
  acá directamente, **nunca**. Solo llega código a través de un Pull Request
  desde `develop`, y lo mergea una persona designada (ver el final de esta
  guía) después de probar que todo funciona.
- **`develop`** → es donde vive el trabajo en curso, la rama "de integración".
  Tu código nuevo entra acá, a través de un Pull Request desde tu propia rama.

**Regla de oro: nunca hagas `git push` directo a `main` ni a `develop`.**
Todo cambio entra por un Pull Request (PR), aunque sea un cambio de una
línea. Esto existe para que alguien más revise el código antes de que
afecte a todo el equipo (o a producción), y para que quede un historial
claro de qué se cambió y por qué.

## 0. Configuración inicial (una sola vez)

Si todavía no clonaste el repo:

```bash
git clone https://github.com/CampusPF/pf-back.git
cd pf-back
npm install
cp .env.example .env
```

Completá el `.env` con tus credenciales de desarrollo (pedile a quien
administre el proyecto los valores reales si no los tenés — nunca se
comparten por chat común, usá un gestor de contraseñas o 1Password/similar).

### Base de datos: siempre por migraciones

`synchronize` está en `false` en todos los entornos. Después de clonar, y cada
vez que traigas cambios de `develop`, poné la base al día:

```bash
npm run migration:run
```

Si tocás una entidad, generá su migración y commiteala junto con el cambio:

```bash
npm run migration:generate -- src/migrations/NombreDescriptivo
npm run migration:run
```

> Ojo: `migration:generate` compara **las entidades contra la base**. Por eso
> `synchronize` tiene que quedar en `false`: si la base se sincroniza sola, no
> hay diferencia que detectar y se genera una migración vacía — el cambio anda
> en tu máquina y nunca llega a producción.

### Pagos: cómo se activa el acceso

Hay **dos caminos independientes** que llegan a la misma activación
(`PaymentsService.handlePaymentSucceeded`, idempotente):

1. **Sync al volver del checkout** — el front llama a
   `POST /payments/:intentId/sync` con el `payment_intent` que Stripe agrega a
   la return_url. El back le pregunta a Stripe con la secret key y, si el cobro
   está confirmado, activa en el acto. **Funciona sin webhook**, así que en
   local no hace falta instalar nada.
2. **Webhook `payment_intent.succeeded`** — Stripe → back. Es el respaldo para
   quien paga y cierra la pestaña antes de volver a la página de éxito.

Stripe no puede alcanzar tu `localhost`, así que en local sólo funciona el
camino 1 (salvo que corras el CLI, abajo). Si alguien cierra la pestaña antes
de volver, su `Payment` queda en `pending`. Para recuperarlo:

```bash
npm run stripe:replay -- --dry-run   # ver qué haría, sin tocar nada
npm run stripe:replay                # reenviar
```

El script le pregunta a Stripe por cada `Payment` pendiente y **sólo** reenvía
los que Stripe confirma como `succeeded`; los checkouts abandonados los deja
como están. Nunca inventa un cobro. El handler del back es idempotente, así que
correrlo dos veces no duplica nada.

La alternativa oficial es el CLI de Stripe, dejándolo corriendo mientras
probás pagos:

```bash
stripe listen --forward-to localhost:4000/payments/webhook
```

**Para producción**: hay que registrar `https://<dominio>/payments/webhook` como
endpoint en el Dashboard de Stripe y poner ESE `whsec_` en el `.env` del
servidor. Sin eso, en producción pasa exactamente lo mismo que en local.

## 1. Antes de empezar a trabajar en algo nuevo

Siempre arrancás desde `develop` actualizada. Nunca desde una rama vieja tuya.

```bash
git checkout develop
git pull origin develop
```

`git pull` trae los cambios que subieron tus compañeros mientras vos no
mirabas. Hacer esto SIEMPRE antes de crear una rama nueva evita muchos
conflictos después.

## 2. Creá tu propia rama para la tarea

Nunca trabajes directo sobre `develop`. Creá una rama con un nombre que
describa qué estás haciendo:

```bash
git checkout -b tipo/nombre-corto-de-la-tarea
```

Convención de nombres (`tipo/descripción-en-kebab-case`):

| Tipo | Cuándo usarlo | Ejemplo |
|---|---|---|
| `feature/` | Algo nuevo que no existía | `feature/notificaciones-email` |
| `fix/` | Arreglar un bug | `fix/login-no-valida-email` |
| `chore/` | Tareas que no son feature ni fix (deps, configs, docs) | `chore/actualizar-readme` |

```bash
# Ejemplo real
git checkout -b feature/notificaciones-email
```

Esto te deja parado en una rama nueva, copia exacta de `develop` en este
momento. Todo lo que hagas ahora vive ahí, aislado, sin afectar a nadie más
hasta que abras el PR.

## 3. Trabajá y andá guardando tu progreso (commits)

Mientras programás, andá haciendo commits chicos y frecuentes — no dejes
todo para un commit gigante al final.

```bash
git add .
git commit -m "Agrega validación de formato de email en el registro"
```

Reglas para el mensaje del commit:
- En **presente** y describiendo qué hace el cambio ("Agrega X", "Corrige Y"),
  no lo que hiciste ("Agregué", "Corregí").
- Una idea por commit. Si hiciste dos cosas sin relación, son dos commits.
- Nada de mensajes tipo `"fix"`, `"cambios"`, `"asd"`. Si en 3 meses alguien
  lee ese mensaje sin ver el código, tiene que entender qué pasó.

**Antes de cada commit, corré el build** para no subir código roto:

```bash
npm run build
```

Si no compila, arreglalo antes de commitear. Un commit que rompe el build
le arruina el día a la próxima persona que haga `pull`.

## 4. Subí tu rama a GitHub

La primera vez que pusheás una rama nueva:

```bash
git push -u origin tipo/nombre-corto-de-la-tarea
```

Las veces siguientes, con la rama ya creada en GitHub, alcanza con:

```bash
git push
```

Esto sube tu rama a GitHub, pero **todavía no la mezcla con nada** — sigue
aislada. `develop` no se entera de tu código hasta el paso siguiente.

## 5. Abrí un Pull Request hacia `develop`

1. Andá a [github.com/CampusPF/pf-back](https://github.com/CampusPF/pf-back).
   GitHub va a mostrarte un cartel amarillo "tu rama tuvo cambios recientes"
   con un botón **Compare & pull request**. Cliqueálo.
   (Si no aparece: pestaña **Pull requests** → **New pull request**.)
2. **Importante**: verificá que diga `base: develop` ← `compare: tu-rama`.
   Nunca elijas `base: main` vos mismo.
3. Escribí un título claro y, en la descripción, qué cambiaste y por qué
   (alcanza con 2-3 líneas: "Agrego X porque Y. Probé Z.").
4. Creá el PR.
5. Pedile a un compañero que lo revise (comentario, aprobación). No lo
   mergees vos mismo salvo que el equipo diga lo contrario.
6. Una vez aprobado, hacé clic en **Merge pull request** en GitHub (no hace
   falta ningún comando de terminal para esto).
7. Borrá la rama desde el mismo botón de GitHub después del merge (mantiene
   el repo ordenado). Localmente podés borrarla con:
   ```bash
   git checkout develop
   git pull origin develop
   git branch -d tipo/nombre-corto-de-la-tarea
   ```

## 6. ¿Y cuándo llega el código a producción (`main`)?

**Nadie mergea a `main` por su cuenta.** Cuando `develop` acumuló los
cambios que se quieren llevar a producción, la persona responsable del
deploy (hoy: Ulises) abre un PR de `develop` hacia `main`, verifica que:

- El build pasa (`npm run build`).
- Las migraciones nuevas (si las hay) están generadas y probadas.
- No quedaron `TODO(seguridad)` críticos sin resolver para ese cambio.

y recién ahí lo mergea. Render redeploya automáticamente al detectar el
push a `main`.

## Resumen de comandos (para tener a mano)

```bash
# Empezar algo nuevo
git checkout develop
git pull origin develop
git checkout -b feature/lo-que-sea

# Mientras trabajás
git add .
git commit -m "Descripción clara del cambio"
npm run build          # antes de cada commit, no debe romperse

# Subir y abrir PR
git push -u origin feature/lo-que-sea
# (después: abrir el PR en github.com, base=develop)
```

## Si te encontrás en problemas

- **"Tengo conflictos al hacer pull/merge"**: avisá en el grupo del equipo
  antes de forzar nada. `git push --force` está prohibido en `develop` y
  `main` — puede borrar el trabajo de otra persona.
- **"Me equivoqué de rama y ya hice commits ahí"**: no entres en pánico ni
  hagas `reset --hard`. Avisá, se soluciona sin perder nada.
- **"No sé si esto rompe algo en producción"**: preguntá antes de abrir el
  PR a `main`. Nunca "probemos y vemos" directo en producción.
