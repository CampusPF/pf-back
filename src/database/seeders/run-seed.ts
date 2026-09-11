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
import { seedCourses } from './course.seed';
import { seedLessons } from './lesson.seed';

config(); // carga variables desde .env

const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
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
    ],
    synchronize: false, // el seeder no debe crear/alterar el esquema
});

async function run() {
    await dataSource.initialize();
    console.log('📦 Conectado a la base de datos');

    await seedCourses(dataSource);
    await seedLessons(dataSource);

    await dataSource.destroy();
    console.log('🔌 Conexión cerrada');
}

run().catch((err) => {
    console.error('❌ Error al ejecutar el seeder:', err);
    process.exit(1);
});