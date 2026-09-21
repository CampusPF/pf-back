import { DataSource, IsNull } from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../../course-modules/entities/course-module.entity';
import { Quiz } from '../../quizzes/entities/quiz.entity';
import { Question } from '../../quizzes/entities/question.entity';
import { Option } from '../../quizzes/entities/option.entity';

/* Checkpoints de demo, para probar el flujo completo:
   inscribirse → completar lecciones → aprobar los checkpoints → emitir el certificado.

   Un quiz por módulo más uno de fin de curso (`module: null`). En cada
   pregunta la opción correcta es la marcada con `correct: true` — acá queda
   escrita para poder aprobar a mano; la API nunca la devuelve al alumno.

   Idempotente: si el curso ya tiene un quiz para ese módulo (o el de fin de
   curso), no lo toca. Va después de seedLessons: necesita los módulos. */

interface OptionSeed {
  text: string;
  correct?: boolean;
}

interface QuestionSeed {
  text: string;
  options: OptionSeed[];
}

interface QuizSeed {
  /** Orden del módulo en el temario; null = checkpoint de fin de curso. */
  module: number | null;
  title: string;
  passingScore: number;
  questions: QuestionSeed[];
}

const QUIZZES: Record<string, QuizSeed[]> = {
  'Introducción a NestJS': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        {
          text: '¿Sobre qué plataforma corre NestJS?',
          options: [{ text: 'Node.js', correct: true }, { text: 'La JVM' }, { text: '.NET' }],
        },
        {
          text: '¿Qué decorador define un controller?',
          options: [
            { text: '@Injectable()' },
            { text: '@Controller()', correct: true },
            { text: '@Module()' },
          ],
        },
        {
          text: '¿Con qué comando del CLI se crea un proyecto nuevo?',
          options: [
            { text: 'nest start' },
            { text: 'nest generate app' },
            { text: 'nest new', correct: true },
          ],
        },
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        {
          text: '¿Qué decorador marca una clase como entidad de TypeORM?',
          options: [
            { text: '@Entity()', correct: true },
            { text: '@Table()' },
            { text: '@Model()' },
          ],
        },
        {
          text: '¿Cómo se inyecta un repositorio en un service?',
          options: [
            { text: '@Inject(Repository)' },
            { text: '@InjectRepository(Entidad)', correct: true },
            { text: 'new Repository()' },
          ],
        },
        {
          text: '¿Qué hace forFeature en TypeOrmModule?',
          options: [
            { text: 'Registra los repositorios de ese módulo', correct: true },
            { text: 'Crea la conexión a la base' },
            { text: 'Corre las migraciones' },
          ],
        },
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: Introducción a NestJS',
      passingScore: 60,
      questions: [
        {
          text: '¿Dónde se registra un provider para que otro módulo lo use?',
          options: [
            { text: 'En exports del módulo que lo provee', correct: true },
            { text: 'En el main.ts' },
            { text: 'En tsconfig.json' },
          ],
        },
        {
          text: '¿Qué valida los DTOs de entrada en NestJS?',
          options: [
            { text: 'ValidationPipe con class-validator', correct: true },
            { text: 'El ORM' },
            { text: 'Nada, hay que validarlos a mano' },
          ],
        },
      ],
    },
  ],
  'React Avanzado con TypeScript': [
    {
      module: 1,
      title: 'Checkpoint del módulo 1',
      passingScore: 70,
      questions: [
        {
          text: '¿Cuál es el tipo recomendado para children?',
          options: [
            { text: 'React.ReactNode', correct: true },
            { text: 'string' },
            { text: 'any' },
          ],
        },
        {
          text: '¿Para qué sirven los genéricos en un componente?',
          options: [
            { text: 'Para que el tipo de las props dependa de lo que se le pasa', correct: true },
            { text: 'Para renderizar más rápido' },
            { text: 'Para evitar usar hooks' },
          ],
        },
      ],
    },
    {
      module: 2,
      title: 'Checkpoint del módulo 2',
      passingScore: 70,
      questions: [
        {
          text: '¿Qué hace useMemo?',
          options: [
            { text: 'Memoriza un valor calculado entre renders', correct: true },
            { text: 'Guarda estado en localStorage' },
            { text: 'Evita que el componente se monte' },
          ],
        },
        {
          text: '¿Qué patrón comparte estado implícito entre componentes hijos?',
          options: [
            { text: 'Compound components', correct: true },
            { text: 'Higher order reducers' },
            { text: 'Singletons' },
          ],
        },
      ],
    },
    {
      module: null,
      title: 'Checkpoint final: React Avanzado',
      passingScore: 60,
      questions: [
        {
          text: '¿Qué conviene tipar en un reducer?',
          options: [
            { text: 'El estado y la unión de acciones', correct: true },
            { text: 'Sólo el estado' },
            { text: 'Nada: se infiere solo' },
          ],
        },
        {
          text: '¿Cuándo tiene sentido useCallback?',
          options: [
            { text: 'Cuando la función se pasa a un hijo memoizado', correct: true },
            { text: 'En toda función de un componente' },
            { text: 'Nunca' },
          ],
        },
      ],
    },
  ],
};

export async function seedQuizzes(dataSource: DataSource) {
  const courseRepo = dataSource.getRepository(Course);
  const moduleRepo = dataSource.getRepository(CourseModuleEntity);
  const quizRepo = dataSource.getRepository(Quiz);

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

      const exists = await quizRepo.exists({
        where: { courseId: course.id, moduleId: moduleId ?? IsNull() },
      });
      if (exists) continue;

      await dataSource.transaction(async (manager) => {
        const quiz = await manager.save(Quiz, {
          courseId: course.id,
          moduleId,
          title: quizData.title,
          passingScore: quizData.passingScore,
        });

        for (const [index, questionData] of quizData.questions.entries()) {
          const question = await manager.save(Question, {
            quizId: quiz.id,
            text: questionData.text,
            order: index + 1,
          });
          await manager.save(
            Option,
            questionData.options.map((option) => ({
              questionId: question.id,
              text: option.text,
              isCorrect: option.correct === true,
            })),
          );
        }
      });
    }
  }

  console.log('✅ Seed de checkpoints (quizzes) completado.');
}
