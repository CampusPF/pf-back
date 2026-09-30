import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Course } from '../../courses/entities/course.entity';
import { Category } from '../../categories/entities/category.entity';
import { User } from '../../users/entities/user.entity';
import { CourseModule as CourseModuleEntity } from '../../course-modules/entities/course-module.entity';
import { CourseEnrollment } from '../../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';
import { LessonResource } from '../../lessons/entities/lesson-resource.entity';
import { LessonProgress } from '../../lesson-progress/entities/lesson-progress.entity';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { Quiz } from '../../quizzes/entities/quiz.entity';
import { Question } from '../../quizzes/entities/question.entity';
import { Option } from '../../quizzes/entities/option.entity';
import { QuizAttempt } from '../../quizzes/entities/quiz-attempt.entity';
import { seedQuizzes } from './quiz.seed';

config();

/**
 * Siembra SOLO los checkpoints: `npm run seed:quizzes`.
 *
 * Separado de `npm run seed` porque ese vuelve a pisar la descripción, el
 * precio y la imagen de los cursos de demo con los valores del seed. Éste no
 * toca cursos ni lecciones: crea los checkpoints que falten y completa las
 * preguntas que le falten a los existentes.
 *
 * Es idempotente: se puede correr las veces que haga falta.
 */
const useSsl = process.env.DB_SSL === 'true';
const ssl = useSsl ? { rejectUnauthorized: false } : false;

const connectionOptions = process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL, ssl }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl,
    };

const dataSource = new DataSource({
    type: 'postgres',
    ...connectionOptions,
    // Course arrastra sus relaciones: TypeORM necesita conocer todas.
    entities: [
        Course,
        Category,
        User,
        CourseModuleEntity,
        CourseEnrollment,
        Lesson,
        LessonResource,
        LessonProgress,
        Subscription,
        Quiz,
        Question,
        Option,
        QuizAttempt,
    ],
    synchronize: false, // el seeder nunca toca el esquema
});

async function run() {
    await dataSource.initialize();
    console.log(`📦 Conectado a ${process.env.DB_HOST ?? 'DATABASE_URL'}`);

    await seedQuizzes(dataSource);

    await dataSource.destroy();
    console.log('🔌 Conexión cerrada');
}

run().catch((err) => {
    console.error('❌ Error al sembrar los checkpoints:', err);
    process.exit(1);
});
