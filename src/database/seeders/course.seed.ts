import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Course, CourseDifficulty } from '../../courses/entities/course.entity';
import { Category } from '../../categories/entities/category.entity';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { generateUniqueSlug } from '../../courses/utils/slug.util';

export async function seedCourses(dataSource: DataSource) {
  const categoryRepo = dataSource.getRepository(Category);
  const userRepo = dataSource.getRepository(User);
  const courseRepo = dataSource.getRepository(Course);

  // --- 1. Categorías ---
  const categoryNames = ['Programación', 'Diseño', 'Marketing', 'Idiomas', 'Negocios'];

  const categories: Category[] = [];
  for (const name of categoryNames) {
    let category = await categoryRepo.findOne({ where: { name } });
    if (!category) {
      category = await categoryRepo.save(categoryRepo.create({ name }));
    }
    categories.push(category);
  }

  // --- 2. Instructor de prueba ---
  let instructor = await userRepo.findOne({ where: { email: 'instructor@campuslite.com' } });
  if (!instructor) {
    const passwordHash = await bcrypt.hash('Instructor123', 10);
    instructor = await userRepo.save(
      userRepo.create({
        name: 'Carlos Ramírez',
        email: 'instructor@campuslite.com',
        passwordHash,
        role: UserRole.TEACHER,
        status: UserStatus.ACTIVE,
      }),
    );
  }

  // --- 3. Cursos ---
  const coursesData: Array<{
    title: string;
    description: string;
    difficulty: CourseDifficulty;
    imageUrl: string;
    categoryName: string;
    priceInCents?: number;
    currency?: string;
  }> = [
    {
      title: 'Introducción a NestJS',
      description: 'Aprendé a construir APIs REST robustas con NestJS, TypeORM y PostgreSQL desde cero.',
      difficulty: CourseDifficulty.BEGINNER,
      imageUrl: 'https://cdn.campuslite.com/covers/nestjs-intro.png',
      categoryName: 'Programación',
    },
    {
      title: 'React Avanzado con TypeScript',
      description: 'Patrones avanzados, manejo de estado, performance y testing en aplicaciones React reales.',
      difficulty: CourseDifficulty.ADVANCED,
      imageUrl: 'https://cdn.campuslite.com/covers/react-avanzado.png',
      categoryName: 'Programación',
      // Curso premium de ejemplo para probar el checkout individual con Stripe.
      priceInCents: 4999,
      currency: 'usd',
    },
    {
      title: 'Fundamentos de UX/UI',
      description: 'Principios de diseño centrado en el usuario, wireframing y prototipado con Figma.',
      difficulty: CourseDifficulty.BEGINNER,
      imageUrl: 'https://cdn.campuslite.com/covers/ux-ui-fundamentos.png',
      categoryName: 'Diseño',
    },
    {
      title: 'Marketing Digital para Emprendedores',
      description: 'Estrategias prácticas de redes sociales, SEO y campañas pagas para hacer crecer tu negocio.',
      difficulty: CourseDifficulty.INTERMEDIATE,
      imageUrl: 'https://cdn.campuslite.com/covers/marketing-digital.png',
      categoryName: 'Marketing',
    },
    {
      title: 'Inglés de Negocios',
      description: 'Vocabulario y expresiones clave para reuniones, negociaciones y correspondencia profesional.',
      difficulty: CourseDifficulty.INTERMEDIATE,
      imageUrl: 'https://cdn.campuslite.com/covers/ingles-negocios.png',
      categoryName: 'Idiomas',
    },
    {
      title: 'Finanzas para no Financieros',
      description: 'Conceptos esenciales de contabilidad, presupuesto y análisis financiero para tomar mejores decisiones.',
      difficulty: CourseDifficulty.BEGINNER,
      imageUrl: 'https://cdn.campuslite.com/covers/finanzas-basicas.png',
      categoryName: 'Negocios',
    },
  ];

  for (const data of coursesData) {
    const exists = await courseRepo.findOne({ where: { title: data.title } });
    if (exists) continue;

    const category = categories.find((c) => c.name === data.categoryName);

    // El seed inserta con el repository directo, así que el slug hay que
    // generarlo acá igual que en CoursesService.create.
    const slug = await generateUniqueSlug(
      data.title,
      async (candidate) => (await courseRepo.countBy({ slug: candidate })) > 0,
    );

    await courseRepo.save(
      courseRepo.create({
        title: data.title,
        slug,
        description: data.description,
        difficulty: data.difficulty,
        imageUrl: data.imageUrl,
        priceInCents: data.priceInCents ?? 0,
        currency: data.currency ?? 'usd',
        category,
        instructor,
      }),
    );
  }

  console.log(`✅ Seed de cursos completado (${coursesData.length} cursos verificados/creados).`);
}
