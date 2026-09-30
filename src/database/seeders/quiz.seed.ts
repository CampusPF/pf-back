import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../../course-modules/entities/course-module.entity';
import { Quiz } from '../../quizzes/entities/quiz.entity';
import { Question } from '../../quizzes/entities/question.entity';
import { Option } from '../../quizzes/entities/option.entity';

/* Checkpoints de demo, para probar el flujo completo:
   inscribirse → completar lecciones → aprobar los checkpoints → emitir el certificado.

   Todos los cursos: un quiz por módulo más uno de fin de curso (`module:
   null`), con 7 preguntas cada uno. En cada pregunta la opción correcta es la
   del índice `correct` — acá queda escrita para poder aprobar a mano; la API
   nunca la devuelve al alumno.

   Idempotente:
   - si el quiz no existe, se crea con todas sus preguntas;
   - si ya existe, se le agregan SÓLO las preguntas que le faltan (se comparan
     por texto). Las que ya tiene no se tocan, así los intentos guardados
     siguen apuntando a preguntas y opciones que existen.
   Va después de seedLessons: necesita los módulos. */

interface QuestionSeed {
  text: string;
  options: string[];
  /** Índice de la opción correcta en `options`. */
  correct: number;
}

interface QuizSeed {
  /** Orden del módulo en el temario; null = checkpoint de fin de curso. */
  module: number | null;
  title: string;
  passingScore: number;
  questions: QuestionSeed[];
}

const q = (text: string, options: string[], correct: number): QuestionSeed => ({
  text,
  options,
  correct,
});

const QUIZZES: Record<string, QuizSeed[]> = {
  'Introducción a NestJS': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        q('¿Sobre qué plataforma corre NestJS?', ['Node.js', 'La JVM', '.NET'], 0),
        q('¿Qué decorador define un controller?', ['@Injectable()', '@Controller()', '@Module()'], 1),
        q('¿Con qué comando del CLI se crea un proyecto nuevo?', ['nest start', 'nest generate app', 'nest new'], 2),
        q('¿Qué decorador atiende una petición GET?', ['@Get()', '@Route("GET")', '@Fetch()'], 0),
        q('¿Cómo se lee un parámetro de ruta como :id?', ["@Query('id')", "@Param('id')", "@Body('id')"], 1),
        q('¿En qué lenguaje se escribe NestJS por defecto?', ['JavaScript puro', 'Go', 'TypeScript'], 2),
        q('¿Qué archivo arranca la aplicación?', ['app.module.ts', 'main.ts', 'nest-cli.json'], 1),
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        q('¿Qué decorador marca una clase como entidad de TypeORM?', ['@Entity()', '@Table()', '@Model()'], 0),
        q('¿Cómo se inyecta un repositorio en un service?', ['@Inject(Repository)', '@InjectRepository(Entidad)', 'new Repository()'], 1),
        q('¿Qué hace forFeature en TypeOrmModule?', ['Registra los repositorios de ese módulo', 'Crea la conexión a la base', 'Corre las migraciones'], 0),
        q('¿Qué decorador define una clave primaria autogenerada?', ['@Id()', '@Key()', '@PrimaryGeneratedColumn()'], 2),
        q('¿Qué decorador define una relación "muchos a uno"?', ['@OneToMany()', '@ManyToOne()', '@BelongsTo()'], 1),
        q('¿Qué método del repositorio busca un único registro que cumpla una condición?', ['save', 'find', 'findOne'], 2),
        q('¿Por qué no conviene usar synchronize: true en producción?', ['Hace más lentas las consultas', 'Puede modificar o borrar columnas del esquema sin control', 'Desactiva las relaciones'], 1),
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: Introducción a NestJS',
      passingScore: 60,
      questions: [
        q('¿Dónde se registra un provider para que otro módulo lo use?', ['En exports del módulo que lo provee', 'En el main.ts', 'En tsconfig.json'], 0),
        q('¿Qué valida los DTOs de entrada en NestJS?', ['ValidationPipe con class-validator', 'El ORM', 'Nada, hay que validarlos a mano'], 0),
        q('¿Qué decorador permite que una clase se inyecte como provider?', ['@Provider()', '@Injectable()', '@Service()'], 1),
        q('¿Qué excepción de Nest responde con un 404?', ['BadRequestException', 'ForbiddenException', 'NotFoundException'], 2),
        q('¿Qué pieza decide si una request puede llegar al handler, por ejemplo para autenticar?', ['Un guard', 'Un pipe', 'Un interceptor'], 0),
        q('¿Qué decorador lee el cuerpo de un POST?', ['@Param()', '@Body()', "@Req('body')"], 1),
        q('Un curso tiene muchos módulos. ¿Qué decorador va del lado del curso?', ['@ManyToOne()', '@ManyToMany()', '@OneToMany()'], 2),
      ],
    },
  ],
  'React Avanzado con TypeScript': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        q('¿Cuál es el tipo recomendado para children?', ['React.ReactNode', 'string', 'any'], 0),
        q('¿Para qué sirven los genéricos en un componente?', ['Para que el tipo de las props dependa de lo que se le pasa', 'Para renderizar más rápido', 'Para evitar usar hooks'], 0),
        q('¿Cómo se marca una prop como opcional?', ['Poniéndola al final de la interfaz', 'Con ? después del nombre', 'No se puede'], 1),
        q('¿Qué tipo tiene el evento onChange de un <input>?', ['Event', 'React.MouseEvent<HTMLInputElement>', 'React.ChangeEvent<HTMLInputElement>'], 2),
        q('Un hook devuelve [valor, setValor]. ¿Cómo conviene tipar ese retorno?', ['Como una tupla, para que cada posición tenga su tipo', 'Como (string | Function)[]', 'No se puede tipar'], 0),
        q('¿Cómo reutilizás las props nativas de un <button> en tu componente?', ['Con HTMLButton', "Con React.ComponentProps<'button'>", 'Copiándolas a mano una por una'], 1),
        q('¿Qué hace extends en <T extends { id: string }>?', ['Hereda de una clase', 'Hace que T sea opcional', 'Restringe T a tipos que tengan id: string'], 2),
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        q('¿Qué hace useMemo?', ['Memoriza un valor calculado entre renders', 'Guarda estado en localStorage', 'Evita que el componente se monte'], 0),
        q('¿Qué patrón comparte estado implícito entre componentes hijos?', ['Compound components', 'Higher order reducers', 'Singletons'], 0),
        q('¿Qué es una render prop?', ['Una prop que se renderiza en el servidor', 'Un atributo HTML especial', 'Una prop que es una función que devuelve JSX'], 2),
        q('¿Qué hace React.memo?', ['Guarda el componente en la caché del navegador', 'Evita re-renderizar si las props no cambiaron', 'Memoriza el estado interno'], 1),
        q('¿Qué problema trae un Context cuyo valor cambia seguido?', ['Re-renderiza a todos sus consumidores', 'Pierde el estado', 'Deja de funcionar en producción'], 0),
        q('¿Cómo se tipa createContext cuando no hay un valor por defecto razonable?', ['createContext<any>()', 'createContext<Tipo | null>(null) y un hook que lo valide', 'No hace falta tiparlo'], 1),
        q('En un reducer, ¿qué tipo permite saber el payload según action.type?', ['Un tipo any', 'Un enum de strings', 'Una unión discriminada'], 2),
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: React Avanzado',
      passingScore: 60,
      questions: [
        q('¿Qué conviene tipar en un reducer?', ['El estado y la unión de acciones', 'Sólo el estado', 'Nada: se infiere solo'], 0),
        q('¿Cuándo tiene sentido useCallback?', ['Cuando la función se pasa a un hijo memoizado', 'En toda función de un componente', 'Nunca'], 0),
        q('¿Qué hook conviene para un estado con muchas transiciones relacionadas?', ['useRef', 'useReducer', 'useId'], 1),
        q('¿Qué devuelve useRef?', ['Un estado que re-renderiza al cambiar', 'Siempre un elemento del DOM', 'Un objeto mutable con .current que persiste entre renders'], 2),
        q('¿Por qué importa una key estable en las listas?', ['Para que React identifique cada elemento entre renders', 'Para el SEO', 'Para ordenar la lista'], 0),
        q('¿Qué tipo usás para una prop que recibe un componente?', ['string', 'React.ComponentType<Props>', 'JSX.Element[]'], 1),
        q('¿Qué define el array de dependencias de useEffect?', ['El orden de los efectos', 'Qué estado se guarda', 'Cuándo vuelve a correr el efecto'], 2),
      ],
    },
  ],
  'Finanzas para no Financieros': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        q('¿Qué muestra el estado de resultados?', ['Ingresos, costos y ganancia de un período', 'Lo que la empresa tiene y debe en un momento', 'La plata que entra y sale de la cuenta'], 0),
        q('¿Cuál es la ecuación del balance?', ['Activo = Ingresos − Gastos', 'Activo = Pasivo + Patrimonio', 'Patrimonio = Activo + Pasivo'], 1),
        q('¿Cuál de estos es un pasivo?', ['La caja', 'La mercadería en stock', 'Un préstamo bancario'], 2),
        q('¿Una empresa con ganancia puede quedarse sin plata?', ['Sí, si cobra tarde y paga antes', 'No, la ganancia es plata en la cuenta', 'Sólo si no paga impuestos'], 0),
        q('¿Qué es el margen bruto?', ['Ventas menos todos los gastos e impuestos', 'Lo que queda en caja a fin de mes', 'Ventas menos el costo de lo vendido'], 2),
        q('¿Qué es el patrimonio neto?', ['Lo que les corresponde a los dueños: activos menos pasivos', 'El total de las ventas del año', 'Las deudas con proveedores'], 0),
        q('¿Qué registra el flujo de caja?', ['Las ventas cuando se facturan', 'Los movimientos reales de dinero cuando ocurren', 'Sólo los gastos'], 1),
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        q('¿Cuál de estos es un costo fijo?', ['La materia prima', 'El alquiler del local', 'La comisión por cada venta'], 1),
        q('¿Qué es el punto de equilibrio?', ['El nivel de ventas en que los ingresos cubren todos los costos', 'El precio más alto que acepta el mercado', 'El momento en que se paga el último préstamo'], 0),
        q('¿Qué es la contribución marginal por unidad?', ['Precio menos costo fijo', 'Costo fijo dividido las unidades', 'Precio menos costo variable unitario'], 2),
        q('Costos fijos $100.000, precio $50 y costo variable $30 por unidad. ¿Cuál es el punto de equilibrio?', ['2.000 unidades', '5.000 unidades', '3.334 unidades'], 1),
        q('¿Para qué sirve un presupuesto?', ['Para anticipar ingresos y gastos, planificar y comparar contra lo real', 'Para calcular impuestos', 'Sólo para pedir un crédito'], 0),
        q('¿Cómo se calcula el ROI?', ['Ventas / costos', 'Inversión / ganancia', '(Ganancia − inversión) / inversión'], 2),
        q('Si sube el costo variable y el precio se mantiene, el punto de equilibrio…', ['Baja', 'Sube: hay que vender más unidades', 'No cambia'], 1),
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: Finanzas para no Financieros',
      passingScore: 60,
      questions: [
        q('¿Qué usás para saber si vas a poder pagar los sueldos del mes que viene?', ['El flujo de caja proyectado', 'El estado de resultados del año pasado', 'El balance de apertura'], 0),
        q('¿Qué es la liquidez?', ['La ganancia del año', 'La capacidad de pagar las deudas de corto plazo', 'El valor de los inmuebles'], 1),
        q('Si subís el precio manteniendo los costos, el punto de equilibrio…', ['Sube', 'No cambia', 'Baja'], 2),
        q('Vendés hoy con cobro a 60 días. ¿Qué pasa?', ['Es ingreso hoy, pero la plata entra en 60 días', 'No es ingreso hasta que cobres', 'Es plata en caja hoy'], 0),
        q('¿Qué es la amortización de un bien de uso?', ['El precio de venta del bien', 'Repartir su costo a lo largo de su vida útil', 'Un impuesto a los bienes'], 1),
        q('¿Qué riesgo trae un endeudamiento alto?', ['Ninguno si hay ganancia', 'Pagar menos impuestos', 'Si caen las ventas, las cuotas siguen igual'], 2),
        q('¿Cómo se llama la diferencia entre lo presupuestado y lo real?', ['Desvío', 'Margen', 'Amortización'], 0),
      ],
    },
  ],
  'Fundamentos de UX/UI': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        q('¿Cuál es la diferencia entre UX y UI?', ['UX es la experiencia completa; UI es la interfaz con la que se interactúa', 'Son lo mismo con distinto nombre', 'UX es el código; UI es el diseño'], 0),
        q('¿Cuál de estos es un método de investigación cualitativo?', ['Un test A/B', 'Entrevistas a usuarios', 'Las métricas de visitas'], 1),
        q('¿Qué es una "persona" en UX?', ['Un usuario real que firmó un acuerdo', 'El cliente que paga el proyecto', 'Un perfil ficticio, basado en investigación, que representa a un grupo de usuarios'], 2),
        q('¿Qué muestra un customer journey?', ['El recorrido del usuario con sus etapas, acciones y emociones', 'El organigrama del equipo de diseño', 'El cronograma del proyecto'], 0),
        q('¿Con cuántos usuarios suele alcanzar una ronda de test para encontrar la mayoría de los problemas?', ['50', 'Unos 5', '500'], 1),
        q('¿Qué pregunta conviene hacer en una entrevista?', ['"¿Usarías esta función?"', '"¿No te parece que esto es fácil?"', '"Contame la última vez que tuviste que…"'], 2),
        q('¿Qué es un pain point?', ['Una frustración o problema que tiene el usuario', 'Un error en el código', 'El precio del producto'], 0),
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        q('¿Qué es la jerarquía visual?', ['Usar muchos colores', 'Ordenar los elementos para que se lea primero lo más importante', 'Poner el logo arriba a la izquierda'], 1),
        q('¿Qué es un wireframe?', ['Un esquema de baja fidelidad de la estructura de una pantalla', 'El diseño final con colores', 'El código HTML de la página'], 0),
        q('¿Para qué sirve un prototipo?', ['Para reemplazar el desarrollo', 'Para elegir la paleta de colores', 'Para probar el flujo antes de desarrollarlo'], 2),
        q('¿Qué contraste mínimo pide WCAG AA para texto normal?', ['2:1', '4.5:1', '10:1'], 1),
        q('¿Por qué no transmitir información sólo con el color?', ['Hay personas que no distinguen algunos colores', 'Porque los colores cansan', 'Porque ocupa más espacio'], 0),
        q('¿Para qué sirve el texto alternativo (alt) de una imagen?', ['Para el título de la pestaña', 'Para que cargue más rápido', 'Para describirla a quien usa un lector de pantalla'], 2),
        q('¿Cuántas familias tipográficas conviene usar en una interfaz?', ['Una por pantalla', 'Una o dos', 'Cuantas más, mejor'], 1),
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: Fundamentos de UX/UI',
      passingScore: 60,
      questions: [
        q('¿Cuál es un orden razonable del proceso de diseño?', ['Investigar → definir → idear → prototipar → testear', 'Diseñar → programar → investigar', 'Testear → investigar → lanzar'], 0),
        q('¿Qué es un test de usabilidad?', ['Una encuesta de satisfacción', 'Observar a usuarios reales intentando hacer tareas', 'Revisar el código'], 1),
        q('¿Qué significa consistencia en una interfaz?', ['Usar siempre el mismo color', 'Tener pocas pantallas', 'Que los mismos elementos se vean y funcionen igual en toda la app'], 2),
        q('¿Qué es una affordance?', ['Que un elemento sugiera cómo se usa, como un botón que parece clickeable', 'El costo del diseño', 'Una animación de carga'], 0),
        q('¿Qué tamaño mínimo se recomienda para un área táctil?', ['Unos 10×10 px', 'Unos 44×44 px', 'Unos 200×200 px'], 1),
        q('¿Para qué sirve el espacio en blanco?', ['Es espacio desperdiciado', 'Sólo para que se vea minimalista', 'Agrupa y separa el contenido y mejora la lectura'], 2),
        q('¿Qué tiene que poder hacer alguien que usa sólo el teclado?', ['Navegar y usar todo sin mouse, viendo dónde está el foco', 'Sólo leer el contenido', 'Nada: es un caso raro'], 0),
      ],
    },
  ],
  'Inglés de Negocios': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        q('¿Cómo empezás un email formal a alguien que no conocés?', ['Dear Mr. Smith,', 'Hey Smith!', 'Yo John,'], 0),
        q('¿Cuál es un cierre formal para un email?', ['Cheers mate', 'Kind regards,', 'Bye!'], 1),
        q('¿Cómo decís correctamente tu cargo?', ['I work of project manager', 'I am working like project manager', 'I work as a project manager'], 2),
        q('¿Cómo avisás que adjuntaste un archivo?', ['Please find attached the report.', 'I send you in attach the report.', 'Please find adjoined the report.'], 0),
        q('¿Cómo te presentás al atender una llamada?', ['Here is Ana.', 'This is Ana from Acme.', 'I am Ana speaking here.'], 1),
        q('¿Cómo pedís que te repitan algo con cortesía?', ['Repeat!', 'What you say?', 'Sorry, could you repeat that, please?'], 2),
        q('En una videollamada te dicen "You\'re on mute". ¿Qué significa?', ['Tenés el micrófono silenciado', 'Se cortó la llamada', 'Estás hablando muy rápido'], 0),
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        q('¿Qué es la "agenda" de una reunión?', ['Tu calendario personal', 'La lista de temas a tratar', 'El acta final'], 1),
        q('¿Cómo das tu opinión con cortesía?', ['In my opinion, we should…', 'You are wrong.', 'I opinion that…'], 0),
        q('¿Cómo mostrás desacuerdo con cortesía?', ["That's stupid.", 'No, no, no.', 'I see your point, but…'], 2),
        q('¿Cómo le pedís su opinión a alguien?', ['Tell me now.', 'What are your thoughts on this?', 'You think what?'], 1),
        q('¿Qué son los "action items" de una reunión?', ['Tareas concretas, con responsable, que salen de la reunión', 'Los temas que no se trataron', 'Los participantes'], 0),
        q('¿Cómo hacés una contraoferta con cortesía?', ['Give me a better price.', 'I want less.', 'Would you consider a 10% discount?'], 2),
        q('¿Cómo confirmás que cerraron un acuerdo?', ['We are agree.', "Then we have a deal.", 'Deal is make.'], 1),
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: Inglés de Negocios',
      passingScore: 60,
      questions: [
        q('¿Qué significa ASAP?', ['Lo antes posible', 'Por favor responder', 'Sin costo adicional'], 0),
        q('¿Qué significa "follow up"?', ['Seguir a alguien en redes', 'Hacer seguimiento', 'Cancelar'], 1),
        q('¿Cuándo usás "I look forward to hearing from you"?', ['Al empezar una llamada', 'Para quejarte', 'Al final de un email, cuando esperás respuesta'], 2),
        q('¿Cuál es la forma más formal de "I want"?', ['I would like', 'I wanna', 'Gimme'], 0),
        q('¿Qué es una "deadline"?', ['Una reunión urgente', 'Una fecha límite', 'Un contrato vencido'], 1),
        q('¿Cómo interrumpís con cortesía?', ['Stop talking.', 'Wait wait wait.', 'Sorry to interrupt, but…'], 2),
        q('¿Qué significa "Let\'s touch base next week"?', ['Hablemos la semana que viene', 'Nos vemos en la oficina central', 'Cancelemos todo'], 0),
      ],
    },
  ],
  'Marketing Digital para Emprendedores': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        q('¿Qué es el cliente ideal (buyer persona)?', ['Un perfil detallado del cliente al que más le sirve tu producto', 'El cliente que más compró el año pasado', 'Cualquier persona que visite la web'], 0),
        q('¿Qué es la propuesta de valor?', ['El precio del producto', 'Por qué un cliente debería elegirte a vos y no a otro', 'El logo y los colores de la marca'], 1),
        q('¿Qué es el posicionamiento?', ['Salir primero en Google', 'La ubicación del local', 'El lugar que querés ocupar en la mente del cliente frente a la competencia'], 2),
        q('¿Qué canales conviene elegir primero?', ['Los que ya usa tu cliente ideal', 'Todos a la vez', 'Siempre el más barato'], 0),
        q('¿Qué es segmentar el mercado?', ['Bajar los precios', 'Dividirlo en grupos con necesidades parecidas', 'Vender en varios países'], 1),
        q('¿Qué problema tiene decir "le vendemos a todo el mundo"?', ['Ninguno: más gente, más ventas', 'Es ilegal', 'El mensaje se diluye y no le habla a nadie'], 2),
        q('¿Qué es un diferencial?', ['Algo que te distingue y que al cliente le importa', 'Un descuento temporal', 'Tener más seguidores'], 0),
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        q('Con un presupuesto chico en redes, ¿qué conviene?', ['Estar en todas las redes', 'Enfocarte en una o dos y publicar con constancia', 'Publicar sólo cuando hay ofertas'], 1),
        q('¿Qué es la tasa de apertura de un email?', ['El porcentaje de destinatarios que lo abrió', 'Cuántos se dieron de baja', 'Cuántos emails se enviaron'], 0),
        q('¿Qué mide el CTR?', ['El costo por cada venta', 'El tiempo en la página', 'El porcentaje de gente que hizo clic sobre la que vio el contenido'], 2),
        q('¿Qué influye más en que un email se abra?', ['El color del pie', 'El asunto', 'El largo de la firma'], 1),
        q('¿Qué es la tasa de conversión?', ['El porcentaje de visitantes que hizo la acción buscada', 'El cambio de moneda', 'Cuántos seguidores nuevos hubo'], 0),
        q('¿Cuál de estas es una métrica de vanidad?', ['Las ventas generadas', 'El costo por cliente', 'La cantidad de seguidores'], 2),
        q('¿Qué es el CAC?', ['La cantidad de clientes activos', 'El costo de adquisición: cuánto gastás para conseguir un cliente', 'El canal de atención al cliente'], 1),
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: Marketing Digital',
      passingScore: 60,
      questions: [
        q('¿Por qué conviene tener una lista de emails propia?', ['Es tuya; el alcance en redes depende del algoritmo', 'Es gratis para siempre', 'Reemplaza a las redes'], 0),
        q('¿Qué representa el embudo de ventas?', ['El stock disponible', 'Las etapas desde que te conocen hasta que compran', 'El organigrama del equipo'], 1),
        q('¿Qué es un test A/B?', ['Comparar tu marca con la competencia', 'Una encuesta de dos preguntas', 'Comparar dos versiones cambiando una sola cosa'], 2),
        q('Si el CAC es mayor que lo que te deja cada cliente…', ['Perdés plata con cada cliente nuevo', 'Crecés más rápido', 'No importa si hay muchas ventas'], 0),
        q('¿Qué es el contenido de valor?', ['Publicidad directa', 'Contenido que resuelve un problema o le enseña algo al cliente', 'Fotos del producto'], 1),
        q('¿Qué es un llamado a la acción (CTA)?', ['El slogan de la marca', 'Un anuncio en la radio', 'Una invitación concreta a dar el próximo paso'], 2),
        q('Una campaña con ROI positivo…', ['Generó más de lo que costó', 'Tuvo muchos likes', 'Llegó a mucha gente'], 0),
      ],
    },
  ],
};

async function insertQuestion(
  manager: EntityManager,
  quizId: string,
  data: QuestionSeed,
  order: number,
): Promise<void> {
  const question = await manager.save(Question, { quizId, text: data.text, order });
  await manager.save(
    Option,
    data.options.map((text, index) => ({
      questionId: question.id,
      text,
      isCorrect: index === data.correct,
    })),
  );
}

export async function seedQuizzes(dataSource: DataSource) {
  const courseRepo = dataSource.getRepository(Course);
  const moduleRepo = dataSource.getRepository(CourseModuleEntity);
  const quizRepo = dataSource.getRepository(Quiz);
  const questionRepo = dataSource.getRepository(Question);

  for (const [courseTitle, quizzes] of Object.entries(QUIZZES)) {
    const course = await courseRepo.findOne({ where: { title: courseTitle } });
    if (!course) {
      console.warn(`⚠️  No se encontró el curso "${courseTitle}". Corré primero seedCourses().`);
      continue;
    }

    for (const quizData of quizzes) {
      let moduleId: string | null = null;
      if (quizData.module !== null) {
        const courseModule = await moduleRepo.findOne({
          where: { order: quizData.module, course: { id: course.id } },
        });
        if (!courseModule) {
          console.warn(
            `⚠️  "${courseTitle}" no tiene módulo ${quizData.module}. Corré primero seedLessons().`,
          );
          continue;
        }
        moduleId = courseModule.id;
      }

      await dataSource.transaction(async (manager) => {
        let quiz = await quizRepo.findOne({
          where: { courseId: course.id, moduleId: moduleId ?? IsNull() },
        });
        quiz ??= await manager.save(Quiz, {
          courseId: course.id,
          moduleId,
          title: quizData.title,
          passingScore: quizData.passingScore,
        });

        // Sólo las que faltan: las existentes (y sus intentos) no se tocan.
        const existing = await questionRepo.find({ where: { quizId: quiz.id } });
        const texts = new Set(existing.map((question) => question.text));
        let order = existing.reduce((max, question) => Math.max(max, question.order), 0);

        for (const questionData of quizData.questions) {
          if (texts.has(questionData.text)) continue;
          await insertQuestion(manager, quiz.id, questionData, ++order);
        }
      });
    }
  }

  console.log('✅ Seed de checkpoints (quizzes) completado.');
}
