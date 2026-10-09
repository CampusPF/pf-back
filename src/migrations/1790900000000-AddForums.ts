import { MigrationInterface, QueryRunner } from "typeorm";

export class AddForums1790900000000 implements MigrationInterface {
    name = 'AddForums1790900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "forum_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" varchar(80) NOT NULL, "slug" varchar(100) NOT NULL, "description" text, "position" int NOT NULL DEFAULT 0, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_forum_categories_slug" UNIQUE ("slug"), CONSTRAINT "PK_forum_categories_id" PRIMARY KEY ("id"))`);

        await queryRunner.query(`CREATE TABLE "forum_threads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "course_id" uuid, "category_id" uuid, "author_id" uuid NOT NULL, "title" varchar(150) NOT NULL, "body" text NOT NULL, "is_pinned" boolean NOT NULL DEFAULT false, "is_locked" boolean NOT NULL DEFAULT false, "solution_post_id" uuid, "reply_count" int NOT NULL DEFAULT 0, "last_activity_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_forum_threads_scope" CHECK (("course_id" IS NULL) <> ("category_id" IS NULL)), CONSTRAINT "PK_forum_threads_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_forum_threads_course_activity" ON "forum_threads" ("course_id", "is_pinned", "last_activity_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_forum_threads_category_activity" ON "forum_threads" ("category_id", "is_pinned", "last_activity_at")`);

        await queryRunner.query(`CREATE TABLE "forum_posts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "thread_id" uuid NOT NULL, "author_id" uuid NOT NULL, "body" text NOT NULL, "edited_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_forum_posts_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_forum_posts_thread_created" ON "forum_posts" ("thread_id", "created_at")`);

        await queryRunner.query(`ALTER TABLE "forum_threads" ADD CONSTRAINT "FK_forum_threads_course" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "forum_threads" ADD CONSTRAINT "FK_forum_threads_category" FOREIGN KEY ("category_id") REFERENCES "forum_categories"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "forum_threads" ADD CONSTRAINT "FK_forum_threads_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "forum_posts" ADD CONSTRAINT "FK_forum_posts_thread" FOREIGN KEY ("thread_id") REFERENCES "forum_threads"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "forum_posts" ADD CONSTRAINT "FK_forum_posts_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE`);
        // Circular con forum_posts: se agrega al final, cuando las dos tablas existen.
        await queryRunner.query(`ALTER TABLE "forum_threads" ADD CONSTRAINT "FK_forum_threads_solution" FOREIGN KEY ("solution_post_id") REFERENCES "forum_posts"("id") ON DELETE SET NULL`);

        // Categorías iniciales del foro general.
        await queryRunner.query(`INSERT INTO "forum_categories" ("name", "slug", "description", "position") VALUES
            ('Presentate', 'general', 'Contanos de vos', 0),
            ('Presentaciones', 'presentaciones', 'Presentate: quién sos y qué estás estudiando.', 1),
            ('Ayuda técnica', 'ayuda-tecnica', 'Problemas con la plataforma, algún video que no cargue o algo con tu cuenta.', 2),
            ('Off-topic', 'off-topic', 'Todo lo que no encaja en otro lado.', 3)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "forum_threads" DROP CONSTRAINT "FK_forum_threads_solution"`);
        await queryRunner.query(`DROP TABLE "forum_posts"`);
        await queryRunner.query(`DROP TABLE "forum_threads"`);
        await queryRunner.query(`DROP TABLE "forum_categories"`);
    }

}
