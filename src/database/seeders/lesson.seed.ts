import { DataSource } from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../../course-modules/entities/course-module.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';

/* Temario de demo de los cursos del seed (ver course.seed.ts: se busca cada
   curso por título). Todas las lecciones traen `minutes`: sin eso el catálogo
   no puede mostrar "12 h · 24 lecciones" y el certificado dice "0 horas".

   Es idempotente: no duplica nada si se corre de nuevo, y a una lección que ya
   existía con 0 minutos (seed anterior a este) le pone la duración. */

interface LessonSeed {
  title: string;
  order: number;
  minutes: number;
}

interface ModuleSeed {
  title: string;
  order: number;
  lessons: LessonSeed[];
}

const SYLLABUS: Record<string, ModuleSeed[]> = {
  'Introducción a NestJS': [
    {
      title: 'Módulo 1: Fundamentos de NestJS',
      order: 1,
      lessons: [
        { title: '¿Qué es NestJS?', order: 1, minutes: 8 },
        { title: 'Instalando el CLI y creando tu primer proyecto', order: 2, minutes: 12 },
        { title: 'Controllers y rutas básicas', order: 3, minutes: 15 },
      ],
    },
    {
      title: 'Módulo 2: Persistencia con TypeORM',
      order: 2,
      lessons: [
        { title: 'Conectando PostgreSQL con TypeORM', order: 1, minutes: 18 },
        { title: 'Entities y relaciones', order: 2, minutes: 20 },
        { title: 'Repositorios y consultas básicas', order: 3, minutes: 16 },
      ],
    },
  ],
  'React Avanzado con TypeScript': [
    {
      title: 'Módulo 1: Tipos en componentes',
      order: 1,
      lessons: [
        { title: 'Tipando props y children', order: 1, minutes: 14 },
        { title: 'Genéricos en componentes reutilizables', order: 2, minutes: 22 },
        { title: 'Tipando hooks personalizados', order: 3, minutes: 18 },
      ],
    },
    {
      title: 'Módulo 2: Patrones avanzados',
      order: 2,
      lessons: [
        { title: 'Context y reducers tipados', order: 1, minutes: 20 },
        { title: 'Render props y compound components', order: 2, minutes: 24 },
        { title: 'Rendimiento: memo, useMemo y useCallback', order: 3, minutes: 17 },
      ],
    },
  ],
  'Fundamentos de UX/UI': [
    {
      title: 'Módulo 1: Pensar en el usuario',
      order: 1,
      lessons: [
        { title: 'Qué es UX y qué es UI', order: 1, minutes: 10 },
        { title: 'Investigación con usuarios', order: 2, minutes: 15 },
        { title: 'Personas y recorridos de usuario', order: 3, minutes: 13 },
      ],
    },
    {
      title: 'Módulo 2: Diseñar la interfaz',
      order: 2,
      lessons: [
        { title: 'Jerarquía visual, color y tipografía', order: 1, minutes: 18 },
        { title: 'Wireframes y prototipos', order: 2, minutes: 20 },
        { title: 'Accesibilidad desde el diseño', order: 3, minutes: 12 },
      ],
    },
  ],
  'Marketing Digital para Emprendedores': [
    {
      title: 'Módulo 1: Estrategia',
      order: 1,
      lessons: [
        { title: 'Definir tu cliente ideal', order: 1, minutes: 12 },
        { title: 'Propuesta de valor y posicionamiento', order: 2, minutes: 14 },
        { title: 'Elegir los canales correctos', order: 3, minutes: 11 },
      ],
    },
    {
      title: 'Módulo 2: Ejecución',
      order: 2,
      lessons: [
        { title: 'Redes sociales con presupuesto chico', order: 1, minutes: 16 },
        { title: 'Email marketing que se abre', order: 2, minutes: 13 },
        { title: 'Medir resultados: métricas que importan', order: 3, minutes: 15 },
      ],
    },
  ],
  'Inglés de Negocios': [
    {
      title: 'Módulo 1: Comunicación profesional',
      order: 1,
      lessons: [
        { title: 'Presentarte y presentar tu empresa', order: 1, minutes: 12 },
        { title: 'Emails formales: estructura y frases clave', order: 2, minutes: 15 },
        { title: 'Llamadas y videollamadas', order: 3, minutes: 14 },
      ],
    },
    {
      title: 'Módulo 2: Reuniones y negociación',
      order: 2,
      lessons: [
        { title: 'Vocabulario de reuniones', order: 1, minutes: 13 },
        { title: 'Dar y pedir opiniones con cortesía', order: 2, minutes: 12 },
        { title: 'Negociar y cerrar acuerdos', order: 3, minutes: 17 },
      ],
    },
  ],
  'Finanzas para no Financieros': [
    {
      title: 'Módulo 1: Lo básico',
      order: 1,
      lessons: [
        { title: 'Leer un estado de resultados', order: 1, minutes: 15 },
        { title: 'Balance: activos, pasivos y patrimonio', order: 2, minutes: 18 },
        { title: 'Flujo de caja: la plata que realmente entra', order: 3, minutes: 14 },
      ],
    },
    {
      title: 'Módulo 2: Decidir con números',
      order: 2,
      lessons: [
        { title: 'Costos fijos, variables y punto de equilibrio', order: 1, minutes: 16 },
        { title: 'Presupuesto y proyecciones simples', order: 2, minutes: 19 },
        { title: 'Indicadores para tomar decisiones', order: 3, minutes: 12 },
      ],
    },
  ],
};

export async function seedLessons(dataSource: DataSource) {
  const courseRepo = dataSource.getRepository(Course);
  const moduleRepo = dataSource.getRepository(CourseModuleEntity);
  const lessonRepo = dataSource.getRepository(Lesson);

  for (const [courseTitle, modulesData] of Object.entries(SYLLABUS)) {
    const course = await courseRepo.findOne({ where: { title: courseTitle } });
    if (!course) {
      console.warn(`⚠️  No se encontró el curso "${courseTitle}". Corré primero seedCourses().`);
      continue;
    }

    for (const moduleData of modulesData) {
      let courseModule = await moduleRepo.findOne({
        where: { title: moduleData.title, course: { id: course.id } },
      });

      if (!courseModule) {
        courseModule = await moduleRepo.save(
          moduleRepo.create({
            title: moduleData.title,
            order: moduleData.order,
            course,
          }),
        );
      }

      for (const lessonData of moduleData.lessons) {
        const exists = await lessonRepo.findOne({
          where: { title: lessonData.title, module: { id: courseModule.id } },
        });

        if (exists) {
          // Seed viejo: la lección quedó con 0 minutos. Sólo se completa esa
          // duración; una que ya fue editada a mano no se pisa.
          if (!exists.durationMinutes) {
            await lessonRepo.update(exists.id, { durationMinutes: lessonData.minutes });
          }
          continue;
        }

        await lessonRepo.save(
          lessonRepo.create({
            title: lessonData.title,
            order: lessonData.order,
            durationMinutes: lessonData.minutes,
            module: courseModule,
          }),
        );
      }
    }
  }

  console.log('✅ Seed de módulos y lecciones completado.');
}
