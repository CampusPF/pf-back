import { DataSource } from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { CourseModule as CourseModuleEntity } from '../../course-modules/entities/course-module.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';

export async function seedLessons(dataSource: DataSource) {
  const courseRepo = dataSource.getRepository(Course);
  const moduleRepo = dataSource.getRepository(CourseModuleEntity);
  const lessonRepo = dataSource.getRepository(Lesson);

  const course = await courseRepo.findOne({ where: { title: 'Introducción a NestJS' } });
  if (!course) {
    console.warn('⚠️  No se encontró el curso "Introducción a NestJS". Corré primero seedCourses().');
    return;
  }

  const modulesData = [
    {
      title: 'Módulo 1: Fundamentos de NestJS',
      order: 1,
      lessons: [
        { title: '¿Qué es NestJS?', order: 1 },
        { title: 'Instalando el CLI y creando tu primer proyecto', order: 2 },
        { title: 'Controllers y rutas básicas', order: 3 },
      ],
    },
    {
      title: 'Módulo 2: Persistencia con TypeORM',
      order: 2,
      lessons: [
        { title: 'Conectando PostgreSQL con TypeORM', order: 1 },
        { title: 'Entities y relaciones', order: 2 },
        { title: 'Repositorios y consultas básicas', order: 3 },
      ],
    },
  ];

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
      if (exists) continue;

      await lessonRepo.save(
        lessonRepo.create({
          title: lessonData.title,
          order: lessonData.order,
          module: courseModule,
        }),
      );
    }
  }

  console.log('✅ Seed de módulos y lecciones completado.');
}
