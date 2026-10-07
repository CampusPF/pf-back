/* eslint-disable */
/**
 * Prepara el escenario de la demo contra el entorno que le digas.
 *
 * Deja listo: un curso con contenido REAL en sus lecciones, sus checkpoints
 * por módulo más el examen final, un alumno inscripto, y un hilo del foro ya
 * respondido por el docente — que es lo que hace sonar la campanita (y el
 * push) del alumno sin tener que actuar el flujo en vivo.
 *
 * Por qué un script y no hacerlo a mano por el panel: seis lecciones con su
 * contenido más cuatro checkpoints con sus preguntas son una hora de carga y
 * varios errores de tipeo. Acá son treinta segundos, y se puede volver a
 * correr si hay que rehacer la demo.
 *
 * ── Credenciales ─────────────────────────────────────────────────────────
 * Alcanza con la cuenta del DOCENTE. No hace falta admin: el alumno se crea
 * por el registro público, que es el mismo camino que usaría una persona.
 *
 * ── Uso (PowerShell) ─────────────────────────────────────────────────────
 *   $env:DEMO_API_URL="https://campus-lite.onrender.com"
 *   $env:DEMO_TEACHER_EMAIL="tumail+docente@gmail.com"
 *   $env:DEMO_TEACHER_PASSWORD="..."
 *   node scripts/seed-demo.js
 *
 * El alumno sale del mismo mail con el +alias: tumail+alumno@gmail.com. Para
 * la plataforma son dos usuarios distintos (normalizeEmail sólo hace trim +
 * lowercase, no toca el "+"), pero los dos mails caen en la misma casilla, así
 * se pueden mostrar las notificaciones de ambos lados sin tener dos cuentas
 * de correo.
 *
 * Es idempotente: comprueba lo que ya existe y crea sólo lo que falta, así que
 * si se corta a la mitad —Render duerme el servicio y la primera request puede
 * irse en timeout— se vuelve a correr y retoma.
 */

require('dotenv').config({ quiet: true });

const API = (process.env.DEMO_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const TEACHER_EMAIL = process.env.DEMO_TEACHER_EMAIL;
const TEACHER_PASSWORD = process.env.DEMO_TEACHER_PASSWORD;
/** Clave del alumno que crea el script. La del docente nunca se imprime. */
const STUDENT_PASSWORD = process.env.DEMO_STUDENT_PASSWORD ?? 'DemoCampus123';

if (!TEACHER_EMAIL || !TEACHER_PASSWORD) {
  console.error(
    'Faltan variables. Necesito DEMO_TEACHER_EMAIL y DEMO_TEACHER_PASSWORD.\n' +
    'Ver el comentario de arriba en scripts/seed-demo.js.',
  );
  process.exit(1);
}

const [localPart, domain] = TEACHER_EMAIL.split('@');
const base = localPart.split('+')[0];
const STUDENT_EMAIL = `${base}+alumno@${domain}`;

const COURSE_SLUG_HINT = 'git-y-github-desde-cero';

// ──────────────────────────────────────────────────────────────────────────
// El curso. Contenido de verdad: es lo que lee el tutor IA para responder y
// para generar el quiz. Con lecciones vacías el tutor improvisa sobre el
// título y se nota muchísimo en la demo.
// ──────────────────────────────────────────────────────────────────────────

const COURSE = {
  title: 'Git y GitHub desde cero',
  description:
    'Control de versiones desde la primera línea de comando hasta trabajar en equipo sin pisarse: commits, ramas, pull requests y cómo salir de los líos más comunes.',
  difficulty: 'beginner',
  priceInCents: 0,
  modules: [
    {
      title: 'Módulo 1: Los fundamentos',
      lessons: [
        {
          title: '¿Qué problema resuelve Git?',
          durationMinutes: 12,
          isFree: true,
          content: `## El problema antes de Git

Antes de usar control de versiones, casi todos pasamos por la misma carpeta:

\`\`\`
proyecto/
  index-final.html
  index-final-2.html
  index-final-ESTE-SI.html
  index-final-ESTE-SI-corregido.html
\`\`\`

Funciona hasta que sos dos personas, o hasta que necesitás saber **qué cambió** entre dos versiones y **por qué**.

## Qué hace Git

Git guarda **fotos** (snapshots) del proyecto completo a lo largo del tiempo. Cada foto se llama **commit** y tiene tres cosas:

- qué archivos cambiaron y en qué líneas,
- quién lo hizo y cuándo,
- un mensaje explicando el porqué.

Lo importante: Git no guarda el archivo entero en cada commit, sino las diferencias. Por eso un repositorio con años de historia puede ocupar menos que una carpeta con cuatro copias del mismo archivo.

## Git no es GitHub

Esta confusión es la más común al empezar:

- **Git** es el programa que corre en tu computadora. Funciona sin internet.
- **GitHub** es un sitio donde podés *guardar una copia* de tu repositorio para compartirlo.

Podés usar Git toda la vida sin tener cuenta en GitHub. Al revés no: GitHub sin Git no tiene sentido.

## Instalación y primer paso

\`\`\`bash
git --version
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
\`\`\`

Ese nombre y ese email van a quedar escritos en cada commit que hagas, así que ponelos bien desde el principio.`,
        },
        {
          title: 'Tu primer repositorio: add, commit, log',
          durationMinutes: 15,
          isFree: true,
          content: `## Crear el repositorio

\`\`\`bash
mkdir mi-proyecto
cd mi-proyecto
git init
\`\`\`

\`git init\` crea una carpeta oculta \`.git\`. Ahí vive toda la historia. Si la borrás, perdés el historial (los archivos quedan).

## Los tres estados

Este es **el** concepto de la lección. Un archivo en Git puede estar en tres lugares:

1. **Working directory** — tu carpeta, donde editás.
2. **Staging area** — lo que elegiste para el próximo commit.
3. **Repositorio** — lo ya commiteado.

El paso del 1 al 2 es \`git add\`. Del 2 al 3, \`git commit\`.

Mucha gente pregunta para qué sirve el paso intermedio. Sirve para esto: tocaste cinco archivos pero dos son de una corrección y tres de otra cosa. Con el staging podés hacer **dos commits separados** en vez de uno que mezcla todo.

## El ciclo completo

\`\`\`bash
git status                    # qué cambió
git add index.html            # un archivo
git add .                     # todo lo modificado
git commit -m "Agrega la portada"
git log --oneline             # la historia
\`\`\`

## Sobre los mensajes de commit

Un buen mensaje dice **por qué**, no qué. El qué ya está en el diff.

\`\`\`
mal:   "cambios"
mal:   "actualiza index.html"
bien:  "Corrige el menú que tapaba el botón de compra en mobile"
\`\`\`

Dentro de seis meses, cuando busques cuándo se rompió algo, vas a agradecer los mensajes del segundo tipo.`,
        },
      ],
    },
    {
      title: 'Módulo 2: Ramas y trabajo en equipo',
      lessons: [
        {
          title: 'Ramas: trabajar sin romper lo que funciona',
          durationMinutes: 14,
          content: `## Qué es una rama

Una rama es una línea de desarrollo paralela. Empezás desde un commit y seguís tu camino sin tocar el principal.

En la práctica: \`main\` tiene el código que funciona; cada cosa nueva se hace en su propia rama y recién se integra cuando está lista.

\`\`\`bash
git branch                       # ver las ramas
git switch -c feature/login      # crear y moverse
git switch main                  # volver
\`\`\`

(Vas a ver \`git checkout -b\` en tutoriales viejos. Hace lo mismo; \`switch\` es más nuevo y más claro.)

## Unir el trabajo

\`\`\`bash
git switch main
git merge feature/login
\`\`\`

Si nadie tocó los mismos archivos, Git lo resuelve solo.

## Conflictos

Un conflicto NO es un error: es Git diciéndote "dos personas cambiaron la misma línea, decidí vos". Se ve así:

\`\`\`
<<<<<<< HEAD
const titulo = "Campus";
=======
const titulo = "Campus Online";
>>>>>>> feature/login
\`\`\`

Lo que hay que hacer es editar el archivo y dejarlo como tiene que quedar, **borrando también las líneas con \`<<<<\`, \`====\` y \`>>>>\`**. Después:

\`\`\`bash
git add archivo-en-conflicto.js
git commit
\`\`\`

El error más común de quien recién empieza es dejar los marcadores \`<<<<<<<\` adentro del código y commitear eso.`,
        },
        {
          title: 'Remotos y pull requests',
          durationMinutes: 13,
          content: `## Conectar con GitHub

\`\`\`bash
git remote add origin https://github.com/usuario/repo.git
git push -u origin main
\`\`\`

\`origin\` es sólo un apodo para esa URL. El \`-u\` deja la rama vinculada, así después alcanza con \`git push\`.

## El ciclo diario

\`\`\`bash
git pull                  # traer lo que hicieron los demás
# ...trabajás...
git add .
git commit -m "..."
git push
\`\`\`

**Hacé \`git pull\` antes de empezar a trabajar, no cuando ya terminaste.** Resolver conflictos sobre código recién escrito es mucho más fácil que sobre un día entero de cambios.

## Pull request

Un PR no es una función de Git: es de GitHub. Es pedir "miren esto antes de integrarlo a main".

1. Subís tu rama: \`git push -u origin feature/login\`
2. En GitHub, "Compare & pull request"
3. Alguien lo revisa y comenta
4. Se mergea

Lo valioso del PR no es el botón de merge, es la conversación: es donde el equipo se pone de acuerdo sobre el código antes de que sea un problema.`,
        },
      ],
    },
    {
      title: 'Módulo 3: Salir de los líos',
      lessons: [
        {
          title: 'Deshacer: restore, revert y reset',
          durationMinutes: 16,
          content: `## Tres comandos, tres situaciones

La pregunta no es "cómo deshago", es **"qué quiero deshacer"**.

### Cambios que todavía no commiteaste

\`\`\`bash
git restore archivo.js        # descarta los cambios del archivo
git restore --staged archivo.js   # lo saca del staging, conserva los cambios
\`\`\`

⚠️ \`git restore archivo.js\` **borra tu trabajo sin preguntar** y no hay forma de recuperarlo: esos cambios nunca estuvieron en la historia.

### Un commit que ya está en la historia

\`\`\`bash
git revert abc1234
\`\`\`

Crea un commit NUEVO que deshace lo que hacía aquel. La historia queda intacta. **Es lo que hay que usar si ya hiciste push.**

### Mover el puntero hacia atrás

\`\`\`bash
git reset --soft HEAD~1    # deshace el commit, conserva los cambios
git reset --hard HEAD~1    # deshace el commit Y los cambios
\`\`\`

\`--soft\` es perfecto para "me olvidé un archivo en el commit anterior".
\`--hard\` destruye trabajo. Pensalo dos veces.

## La regla

**Si ya lo pusheaste, usá \`revert\`. Si todavía es local, podés usar \`reset\`.**

Reescribir historia que otros ya bajaron les rompe el repositorio a todos.`,
        },
        {
          title: '.gitignore y qué nunca subir',
          durationMinutes: 10,
          content: `## Qué no va al repositorio

Tres categorías:

1. **Lo que se regenera**: \`node_modules/\`, \`dist/\`, \`build/\`
2. **Lo de tu máquina**: \`.DS_Store\`, \`.vscode/\`
3. **Secretos**: \`.env\`, claves, certificados

## El archivo

\`\`\`
node_modules/
dist/
.env
.env.local
.DS_Store
*.log
\`\`\`

## Lo más importante de esta lección

\`.gitignore\` sólo funciona sobre archivos que **todavía no** están siendo seguidos por Git. Si ya commiteaste el \`.env\`, agregarlo al \`.gitignore\` no lo saca.

\`\`\`bash
git rm --cached .env
git commit -m "Saca el .env del repositorio"
\`\`\`

Y acá va la parte que a mucha gente le cuesta aceptar: **eso lo saca de los commits nuevos, pero sigue estando en la historia**. Cualquiera que clone el repositorio puede ver esa clave.

Si subiste una credencial de verdad, el orden correcto es:

1. **Rotar la credencial** (cambiarla en el servicio). Esto primero.
2. Después, limpiar la historia si hace falta.

Borrar el archivo y pushear no es suficiente. Asumí que la clave ya está comprometida y cambiala.`,
        },
      ],
    },
  ],
};

/* Checkpoints: uno por módulo y un examen final (moduleId null). Las
   preguntas se responden con lo que dice la lección, no con conocimiento
   previo — si no, el alumno que estudió el material igual las falla. */
const CHECKPOINTS = [
  {
    moduleTitle: 'Módulo 1: Los fundamentos',
    title: 'Checkpoint: fundamentos de Git',
    questions: [
      {
        text: '¿Cuál es la diferencia entre Git y GitHub?',
        options: [
          { text: 'Git corre en tu computadora y funciona sin internet; GitHub es un sitio donde guardás una copia del repositorio.', isCorrect: true },
          { text: 'Son el mismo programa, GitHub es sólo el nombre comercial.', isCorrect: false },
          { text: 'Git es la versión paga y GitHub la gratuita.', isCorrect: false },
          { text: 'Git sirve para archivos de texto y GitHub para imágenes.', isCorrect: false },
        ],
      },
      {
        text: '¿Para qué sirve el staging area (el paso intermedio entre tu carpeta y el repositorio)?',
        options: [
          { text: 'Para elegir qué cambios entran en el próximo commit y poder separar en varios commits lo que tocaste a la vez.', isCorrect: true },
          { text: 'Para hacer una copia de seguridad antes de commitear.', isCorrect: false },
          { text: 'Para subir los archivos a GitHub antes de commitearlos.', isCorrect: false },
          { text: 'Para comprimir los archivos y que ocupen menos.', isCorrect: false },
        ],
      },
      {
        text: 'Según la lección, ¿qué debería explicar un buen mensaje de commit?',
        options: [
          { text: 'El porqué del cambio, porque el qué ya está en el diff.', isCorrect: true },
          { text: 'La lista completa de archivos modificados.', isCorrect: false },
          { text: 'La fecha y la hora en que se hizo el cambio.', isCorrect: false },
          { text: 'El número de líneas agregadas y borradas.', isCorrect: false },
        ],
      },
    ],
  },
  {
    moduleTitle: 'Módulo 2: Ramas y trabajo en equipo',
    title: 'Checkpoint: ramas y trabajo en equipo',
    questions: [
      {
        text: '¿Qué es un conflicto de merge?',
        options: [
          { text: 'Git avisando que dos cambios tocaron la misma línea y que la decisión la tenés que tomar vos.', isCorrect: true },
          { text: 'Un error de Git que obliga a volver a clonar el repositorio.', isCorrect: false },
          { text: 'Una advertencia de que la rama está desactualizada.', isCorrect: false },
          { text: 'Un problema de permisos en GitHub.', isCorrect: false },
        ],
      },
      {
        text: 'Al resolver un conflicto, ¿qué hay que hacer con las líneas `<<<<<<<`, `=======` y `>>>>>>>`?',
        options: [
          { text: 'Borrarlas: son marcadores de Git, no parte del código.', isCorrect: true },
          { text: 'Dejarlas, Git las limpia sola al commitear.', isCorrect: false },
          { text: 'Comentarlas para conservar el historial del conflicto.', isCorrect: false },
          { text: 'Moverlas al final del archivo.', isCorrect: false },
        ],
      },
      {
        text: 'Según la lección, ¿cuándo conviene hacer `git pull`?',
        options: [
          { text: 'Antes de empezar a trabajar, no cuando ya terminaste.', isCorrect: true },
          { text: 'Sólo cuando aparece un conflicto.', isCorrect: false },
          { text: 'Justo después de cada commit.', isCorrect: false },
          { text: 'Una vez por semana, para no traer cambios de más.', isCorrect: false },
        ],
      },
    ],
  },
  {
    moduleTitle: 'Módulo 3: Salir de los líos',
    title: 'Checkpoint: deshacer cambios',
    questions: [
      {
        text: 'Ya hiciste push de un commit y querés deshacerlo. ¿Qué usás?',
        options: [
          { text: '`git revert`, que suma un commit nuevo deshaciendo el anterior sin reescribir la historia.', isCorrect: true },
          { text: '`git reset --hard`, que lo borra de la historia.', isCorrect: false },
          { text: '`git restore`, que descarta los cambios del archivo.', isCorrect: false },
          { text: 'Ninguno: una vez pusheado no se puede deshacer.', isCorrect: false },
        ],
      },
      {
        text: 'Agregaste `.env` al `.gitignore`, pero ya lo habías commiteado antes. ¿Qué pasa?',
        options: [
          { text: 'Sigue siendo seguido por Git: hay que sacarlo con `git rm --cached`, y además la clave ya está en la historia.', isCorrect: true },
          { text: 'Se borra del repositorio automáticamente en el próximo commit.', isCorrect: false },
          { text: 'Git lo ignora a partir de ese momento y lo saca de toda la historia.', isCorrect: false },
          { text: 'El `.gitignore` no funciona si el archivo empieza con un punto.', isCorrect: false },
        ],
      },
      {
        text: 'Subiste una credencial real al repositorio. ¿Cuál es el primer paso?',
        options: [
          { text: 'Rotarla: cambiarla en el servicio. Asumir que ya está comprometida.', isCorrect: true },
          { text: 'Borrar el archivo y hacer push.', isCorrect: false },
          { text: 'Agregarla al `.gitignore`.', isCorrect: false },
          { text: 'Poner el repositorio en privado.', isCorrect: false },
        ],
      },
    ],
  },
  {
    moduleTitle: null, // examen final del curso
    title: 'Examen final: Git y GitHub',
    questions: [
      {
        text: '¿Qué guarda Git en cada commit?',
        options: [
          { text: 'Las diferencias respecto del estado anterior, más quién lo hizo, cuándo y por qué.', isCorrect: true },
          { text: 'Una copia completa de todos los archivos del proyecto.', isCorrect: false },
          { text: 'Sólo los nombres de los archivos que cambiaron.', isCorrect: false },
          { text: 'Un enlace al archivo en GitHub.', isCorrect: false },
        ],
      },
      {
        text: '¿Qué hace `git switch -c feature/login`?',
        options: [
          { text: 'Crea la rama `feature/login` y te mueve a ella.', isCorrect: true },
          { text: 'Mergea `feature/login` en la rama actual.', isCorrect: false },
          { text: 'Borra la rama `feature/login`.', isCorrect: false },
          { text: 'Sube la rama `feature/login` a GitHub.', isCorrect: false },
        ],
      },
      {
        text: '¿Qué es un pull request?',
        options: [
          { text: 'Una función de GitHub para pedir revisión de una rama antes de integrarla.', isCorrect: true },
          { text: 'El comando de Git que trae los cambios del remoto.', isCorrect: false },
          { text: 'Otra forma de llamar al `git merge`.', isCorrect: false },
          { text: 'Un pedido de permisos de escritura sobre el repositorio.', isCorrect: false },
        ],
      },
      {
        text: '¿Cuál de estos NO debería estar en el repositorio?',
        options: [
          { text: 'El archivo `.env` con las claves de la aplicación.', isCorrect: true },
          { text: 'El `.gitignore`.', isCorrect: false },
          { text: 'El `README.md`.', isCorrect: false },
          { text: 'El `package.json`.', isCorrect: false },
        ],
      },
    ],
  },
];

// Hilo que deja la campanita del alumno con algo adentro.
const FORUM = {
  title: '¿Cuándo conviene usar revert en lugar de reset?',
  body:
    'Vi la lección de deshacer cambios y me quedó la duda práctica: si me equivoqué en el último commit y todavía no hice push, ¿da lo mismo cualquiera de los dos? Pregunto porque a veces trabajo sola en una rama.',
  reply:
    'Buena pregunta, y la respuesta corta es que mientras sea **local y tuyo**, da lo mismo.\n\nLa diferencia aparece cuando el commit ya está en el remoto: ahí `reset` reescribe la historia que los demás ya bajaron, y cuando hagan `pull` les va a quedar el repositorio hecho un nudo. `revert`, en cambio, suma un commit nuevo que deshace el anterior, así que nadie se entera de nada raro.\n\nLa regla que uso: **si ya lo pusheaste, revert. Si todavía no, reset.**\n\n```bash\ngit reset --soft HEAD~1   # me olvidé un archivo, lo rehago\ngit revert abc1234        # ya está pusheado, lo deshago sumando\n```',
};

// ──────────────────────────────────────────────────────────────────────────

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      (data && (Array.isArray(data.message) ? data.message.join('; ') : data.message)) ||
      `HTTP ${response.status}`;
    const error = new Error(`${method} ${path} → ${message}`);
    error.status = response.status;
    throw error;
  }
  // El back a veces envuelve en { data }, a veces no.
  return data && typeof data === 'object' && 'data' in data && !Array.isArray(data)
    ? data.data
    : data;
}

async function login(email, password) {
  const session = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return session.access_token ?? session.accessToken;
}

/**
 * Devuelve el token del alumno, registrándolo si todavía no existe.
 *
 * Se intenta el login primero: es la única forma de saber si la cuenta está
 * sin pedir permisos de admin. Si no está, se usa el registro público — el
 * mismo camino que haría una persona, así que no necesita privilegios.
 */
async function ensureStudent() {
  try {
    const token = await login(STUDENT_EMAIL, STUDENT_PASSWORD);
    console.log(`  • La alumna ya existía: ${STUDENT_EMAIL}`);
    return token;
  } catch (error) {
    if (error.status !== 401) throw error;
  }

  try {
    const session = await api('/auth/register', {
      method: 'POST',
      body: {
        name: 'Alumna Demo',
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
        confirmPassword: STUDENT_PASSWORD,
        birthDate: '1996-04-12',
        phone: '+5493510000000',
      },
    });
    console.log(`  ✔ Alumna registrada: ${STUDENT_EMAIL}`);
    return session.access_token ?? session.accessToken;
  } catch (error) {
    /* La cuenta existe pero con otra clave: el login de arriba dio 401 y el
       registro rebota por duplicado. Decirlo explícitamente, porque "el email
       ya está registrado" sin contexto hace pensar que el script está roto. */
    if (/ya está registrado/i.test(error.message)) {
      throw new Error(
        `La cuenta ${STUDENT_EMAIL} ya existe, pero no con la clave que le pasé.\n` +
        `  Volvé a correr el script agregando la clave real:\n` +
        `    $env:DEMO_STUDENT_PASSWORD="la-clave-de-esa-cuenta"`,
      );
    }
    throw error;
  }
}

async function main() {
  console.log(`\nPreparando la demo contra ${API}\n`);

  console.log('1. Cuentas');
  const teacherToken = await login(TEACHER_EMAIL, TEACHER_PASSWORD);
  console.log(`  • Docente: ${TEACHER_EMAIL}`);
  const studentToken = await ensureStudent();

  console.log('\n2. Curso');
  const categories = await api('/categories');
  const category =
    categories.find((c) => /program/i.test(c.name)) ?? categories[0];
  if (!category) throw new Error('No hay categorías cargadas en este entorno.');

  const existing = await api('/courses').then((list) =>
    (Array.isArray(list) ? list : list.data).find((c) => c.slug?.startsWith(COURSE_SLUG_HINT)),
  );

  let course;
  if (existing) {
    course = existing;
    console.log(`  • El curso ya existía: /courses/${course.slug}`);
  } else {
    course = await api('/courses', {
      method: 'POST',
      token: teacherToken,
      body: {
        title: COURSE.title,
        description: COURSE.description,
        difficulty: COURSE.difficulty,
        priceInCents: COURSE.priceInCents,
        categoryId: category.id,
      },
    });
    console.log(`  ✔ Curso creado: /courses/${course.slug}`);
  }

  /* El temario se completa SIEMPRE, no sólo al crear el curso. Si una corrida
     anterior se cortó a la mitad (pasa: Render free se duerme y la primera
     request despierta el servicio con timeout), al reintentar el curso ya
     existe y, saltándolo, quedaba un temario incompleto para siempre. Acá se
     compara por título y se crea sólo lo que falta. */
  const detail = await api(`/courses/${course.id}`);
  const existingModules = detail.modules ?? [];

  for (const [moduleIndex, mod] of COURSE.modules.entries()) {
    let target = existingModules.find((m) => m.title === mod.title);
    if (!target) {
      target = await api('/course-modules', {
        method: 'POST',
        token: teacherToken,
        body: { title: mod.title, courseId: course.id, order: moduleIndex + 1 },
      });
      target.lessons = [];
    }

    const haveLessons = (target.lessons ?? []).map((l) => l.title);
    let created = 0;
    for (const [lessonIndex, lesson] of mod.lessons.entries()) {
      if (haveLessons.includes(lesson.title)) continue;
      await api('/lessons', {
        method: 'POST',
        token: teacherToken,
        body: {
          title: lesson.title,
          moduleId: target.id,
          content: lesson.content,
          durationMinutes: lesson.durationMinutes,
          isFree: lesson.isFree ?? false,
          order: lessonIndex + 1,
        },
      });
      created += 1;
    }

    console.log(
      created > 0
        ? `  ✔ ${mod.title} (+${created} ${created === 1 ? 'lección' : 'lecciones'} con contenido)`
        : `  • ${mod.title} ya estaba completo`,
    );
  }

  console.log('\n3. Checkpoints');
  // Se vuelve a pedir el curso: ahora ya tiene los módulos con sus ids.
  const withModules = await api(`/courses/${course.id}`);
  const existingQuizzes = await api(`/courses/${course.id}/quizzes/manage`, {
    token: teacherToken,
  }).catch(() => []);
  const quizTitles = (Array.isArray(existingQuizzes) ? existingQuizzes : []).map(
    (q) => q.title,
  );

  for (const checkpoint of CHECKPOINTS) {
    if (quizTitles.includes(checkpoint.title)) {
      console.log(`  • ${checkpoint.title} ya existía`);
      continue;
    }

    const moduleId = checkpoint.moduleTitle
      ? withModules.modules?.find((m) => m.title === checkpoint.moduleTitle)?.id
      : null;

    if (checkpoint.moduleTitle && !moduleId) {
      console.log(`  ⚠ No encontré el módulo "${checkpoint.moduleTitle}", salteo su checkpoint`);
      continue;
    }

    await api('/quizzes', {
      method: 'POST',
      token: teacherToken,
      body: {
        courseId: course.id,
        moduleId,
        title: checkpoint.title,
        passingScore: 60,
        questions: checkpoint.questions.map((q, index) => ({
          text: q.text,
          order: index + 1,
          options: q.options,
        })),
      },
    });
    console.log(
      `  ✔ ${checkpoint.title} (${checkpoint.questions.length} preguntas)` +
      (moduleId ? '' : ' — examen final'),
    );
  }

  console.log('\n4. Inscripción del alumno');
  try {
    await api('/course-enrollments', {
      method: 'POST',
      token: studentToken,
      body: { courseId: course.id },
    });
    console.log('  ✔ Alumno inscripto (le llega el mail de inscripción)');
  } catch (error) {
    if (error.status === 409) console.log('  • El alumno ya estaba inscripto');
    else throw error;
  }

  console.log('\n5. Foro');
  // Igual que el temario: no duplicar si ya se corrió antes.
  const threads = await api(`/courses/${course.id}/forum/threads`, { token: studentToken });
  let thread = (threads.data ?? threads).find((t) => t.title === FORUM.title);

  if (thread) {
    console.log('  • El hilo ya existía');
  } else {
    thread = await api(`/courses/${course.id}/forum/threads`, {
      method: 'POST',
      token: studentToken,
      body: { title: FORUM.title, body: FORUM.body },
    });
    console.log('  ✔ La alumna abrió un hilo (le avisa al docente)');
  }

  if ((thread.replyCount ?? 0) > 0) {
    console.log('  • El hilo ya tenía respuesta');
  } else {
    await api(`/forum/threads/${thread.id}/posts`, {
      method: 'POST',
      token: teacherToken,
      body: { body: FORUM.reply },
    });
    console.log('  ✔ El docente respondió → campanita + push para la alumna');
  }

  console.log(`
────────────────────────────────────────────────────────
Listo.

  Docente:  ${TEACHER_EMAIL}   (tu clave de siempre)
  Alumna:   ${STUDENT_EMAIL}
            clave: ${STUDENT_PASSWORD}

  Curso:    /courses/${course.slug}
  Hilo:     /dashboard/foros/hilo/${thread.id}

Antes de la demo:
  · Entrá con la alumna y activá las notificaciones desde la campana.
  · Abrí el tutor en una lección y hacé una pregunta cualquiera: despierta
    al proveedor de IA y evita que la primera respuesta en vivo tarde.
  · La campana de la alumna ya tiene la respuesta del docente adentro.
  · Para mostrar "repetir checkpoint": rendí uno con la alumna ahora, así
    en la demo ya hay un intento previo que mostrar.
────────────────────────────────────────────────────────
`);
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`);
  process.exit(1);
});
