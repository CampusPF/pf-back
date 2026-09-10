import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema completo del proyecto, consolidado en una sola migración.
 *
 * ── Por qué se reescribió ────────────────────────────────────────────────
 * Las migraciones anteriores (InitialSchema + AddStripePayments +
 * AddCourseSlug + AddLessonDurationAndFree) se generaron con
 * `migration:generate` contra una base que `synchronize` ya había armado.
 * `migration:generate` compara ENTIDADES contra la BASE, así que todo lo que
 * `synchronize` ya había creado quedó fuera del diff: la extensión
 * `uuid-ossp`, los 9 tipos ENUM, y las columnas `isActive` de courses /
 * course_modules / course_enrollments.
 *
 * Resultado: la cadena de migraciones NUNCA pudo correr sobre una base
 * limpia (fallaba con `no existe la función uuid_generate_v4()` y `no existe
 * el tipo ..._enum`). En local "funcionaba" sólo porque el schema lo había
 * armado `synchronize` antes de apagarlo.
 *
 * Esta migración parte de un dump real del schema (generado por `synchronize`
 * desde las entidades actuales) y lo recrea entero, en orden de dependencias:
 * extensión → tipos → tablas → PK/unique → índices → FKs.
 *
 * `down()` borra el schema `public` completo y lo recrea vacío.
 */
export class InitialSchema1788798058686 implements MigrationInterface {
    name = 'InitialSchema1788798058686';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- Extensión: uuid_generate_v4() ---
        await queryRunner.query(
            `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
        );

        // --- Tipos ENUM ---
        await queryRunner.query(
            `CREATE TYPE "public"."ai_tutor_messages_role_enum" AS ENUM('user', 'assistant')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."courses_difficulty_enum" AS ENUM('beginner', 'intermediate', 'advanced')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."payments_type_enum" AS ENUM('course', 'subscription')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."payments_plan_enum" AS ENUM('free', 'premium')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'succeeded', 'failed')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."subscriptions_plan_enum" AS ENUM('free', 'premium')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."subscriptions_status_enum" AS ENUM('active', 'cancelled', 'expired')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."users_role_enum" AS ENUM('student', 'teacher', 'admin')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive', 'banned', 'deleted')`,
        );

        // --- Tablas ---
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying(100) NOT NULL,
                "email" character varying NOT NULL,
                "passwordHash" character varying,
                "googleId" character varying,
                "role" "public"."users_role_enum" NOT NULL DEFAULT 'student',
                "status" "public"."users_status_enum" NOT NULL DEFAULT 'active',
                "birthDate" date,
                "phone" character varying,
                "address" character varying(200),
                "city" character varying(100),
                "country" character varying(100),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "UQ_f382af58ab36057334fb262efd5" UNIQUE ("googleId"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "categories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "description" character varying,
                "imageUrl" character varying,
                "color" character varying,
                "icon" character varying,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"),
                CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "courses" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "slug" character varying NOT NULL,
                "description" text,
                "difficulty" "public"."courses_difficulty_enum" NOT NULL DEFAULT 'beginner',
                "image_url" character varying,
                "price_in_cents" integer NOT NULL DEFAULT 0,
                "currency" character varying(3) NOT NULL DEFAULT 'usd',
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "instructorId" uuid,
                "categoryId" uuid,
                CONSTRAINT "UQ_a3bb2d01cfa0f95bc5e034e1b7a" UNIQUE ("slug"),
                CONSTRAINT "PK_3f70a487cc718ad8eda4e6d58c9" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "course_modules" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "order_index" integer NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "courseId" uuid,
                CONSTRAINT "PK_4c195db0718e8845a6e09075ebc" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "lessons" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying NOT NULL,
                "content" text,
                "video_url" character varying,
                "order_index" integer NOT NULL,
                "duration_minutes" integer NOT NULL DEFAULT 0,
                "is_free" boolean NOT NULL DEFAULT false,
                "isActive" boolean NOT NULL DEFAULT true,
                "moduleId" uuid,
                CONSTRAINT "PK_9b9a8d455cac672d262d7275730" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "course_enrollments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "progress_percent" integer NOT NULL DEFAULT 0,
                "isActive" boolean NOT NULL DEFAULT true,
                "completed_at" TIMESTAMP,
                "enrolled_at" TIMESTAMP NOT NULL DEFAULT now(),
                "studentId" uuid,
                "courseId" uuid,
                CONSTRAINT "UQ_aa0733fce70a4a97704f1d4a340" UNIQUE ("studentId", "courseId"),
                CONSTRAINT "PK_609f6e4f0fc9a6149a35211b380" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "lesson_progress" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "completed" boolean NOT NULL DEFAULT false,
                "completed_at" TIMESTAMP,
                "enrollmentId" uuid,
                "lessonId" uuid,
                CONSTRAINT "UQ_36b8a65b9550e0b692d83da75e9" UNIQUE ("enrollmentId", "lessonId"),
                CONSTRAINT "PK_e6223ebbc5f8f5fce40e0193de1" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "subscriptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "plan" "public"."subscriptions_plan_enum" NOT NULL,
                "status" "public"."subscriptions_status_enum" NOT NULL DEFAULT 'active',
                "start_date" TIMESTAMP NOT NULL,
                "end_date" TIMESTAMP NOT NULL,
                "last_payment_amount" numeric(10,2) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid,
                CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "type" "public"."payments_type_enum" NOT NULL,
                "plan" "public"."payments_plan_enum",
                "stripe_payment_intent_id" character varying NOT NULL,
                "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending',
                "amount_in_cents" integer NOT NULL,
                "currency" character varying(3) NOT NULL DEFAULT 'usd',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid NOT NULL,
                "courseId" uuid,
                CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "ai_tutor_conversations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "studentId" uuid,
                "lessonId" uuid,
                CONSTRAINT "PK_c730da0e75ff46600be3d63c692" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "ai_tutor_messages" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "role" "public"."ai_tutor_messages_role_enum" NOT NULL,
                "content" text NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "conversationId" uuid,
                CONSTRAINT "PK_975661e0bd8f65ed85182117539" PRIMARY KEY ("id")
            )
        `);

        // --- Índices ---
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_94c6e6376625bc6710d7dbb4b6" ON "payments" ("stripe_payment_intent_id")`,
        );

        // --- Foreign keys ---
        await queryRunner.query(
            `ALTER TABLE "courses" ADD CONSTRAINT "FK_e6714597bea722629fa7d32124a" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "courses" ADD CONSTRAINT "FK_c730473dfb837b3e62057cd9447" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "course_modules" ADD CONSTRAINT "FK_0a332e19d988804687be4637bfc" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "lessons" ADD CONSTRAINT "FK_16e7969589c0b789d9868782259" FOREIGN KEY ("moduleId") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "course_enrollments" ADD CONSTRAINT "FK_0533bdb161365ccbec0c8906408" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "course_enrollments" ADD CONSTRAINT "FK_d77e489db35c7d325700d799be6" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "lesson_progress" ADD CONSTRAINT "FK_5bc4ad7572c19f8c12a67fee6b1" FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "lesson_progress" ADD CONSTRAINT "FK_df13299d2740b302dd44a368df9" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_fbdba4e2ac694cf8c9cecf4dc84" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "payments" ADD CONSTRAINT "FK_d35cb3c13a18e1ea1705b2817b1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "payments" ADD CONSTRAINT "FK_00097d3b3147848e3585aabb433" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "ai_tutor_conversations" ADD CONSTRAINT "FK_5be72a4fb0f29b03558674aa356" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "ai_tutor_conversations" ADD CONSTRAINT "FK_d0d815a6097bae3be2e67bbb407" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "ai_tutor_messages" ADD CONSTRAINT "FK_9577a05822ff78a1a7f9ccc9050" FOREIGN KEY ("conversationId") REFERENCES "ai_tutor_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Teardown completo: más simple y confiable que revertir 40 statements
        // en orden inverso. Deja la base como recién creada.
        await queryRunner.query(`DROP SCHEMA "public" CASCADE`);
        await queryRunner.query(`CREATE SCHEMA "public"`);
        await queryRunner.query(`GRANT ALL ON SCHEMA "public" TO public`);
    }
}
