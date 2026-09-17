import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGamificationAndContentTables1789645228343 implements MigrationInterface {
    name = 'CreateGamificationAndContentTables1789645228343'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "achievement" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, "description" text NOT NULL, "icon" character varying(100) NOT NULL, "condition" jsonb NOT NULL, CONSTRAINT "UQ_9262a29763482eb20bfdd2a9c53" UNIQUE ("code"), CONSTRAINT "PK_441339f40e8ce717525a381671e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_achievement" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "achievement_id" uuid NOT NULL, "unlocked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_user_achievement_user_achievement" UNIQUE ("user_id", "achievement_id"), CONSTRAINT "PK_99df4f0afe2d706c05004854aa5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "certificate" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "course_id" uuid NOT NULL, "code" character varying(20) NOT NULL, "pdf_url" character varying(500) NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9c263067e4ed9782c88b4b347e0" UNIQUE ("code"), CONSTRAINT "UQ_certificate_user_course" UNIQUE ("user_id", "course_id"), CONSTRAINT "PK_8daddfc65f59e341c2bbc9c9e43" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "xp_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "amount" integer NOT NULL, "reason" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7ad11288f93bbc5c157bad4f7bb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_xp_log_user" ON "xp_log"  ("user_id") `);
        await queryRunner.query(`CREATE TABLE "notification" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" character varying(50) NOT NULL, "channel" character varying(20) NOT NULL DEFAULT 'in_app', "title" character varying(150) NOT NULL, "message" text NOT NULL, "link" character varying(255), "dedupe_key" character varying(255), "read" boolean NOT NULL DEFAULT false, "read_at" TIMESTAMP WITH TIME ZONE, "sent_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_notification_user_dedupe" ON "notification"  ("user_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_notification_user_created" ON "notification"  ("user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_notification_user_read" ON "notification"  ("user_id", "read") `);
        await queryRunner.query(`CREATE TABLE "quiz" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "course_id" uuid NOT NULL, "module_id" uuid, "title" character varying(150) NOT NULL, "passing_score" integer NOT NULL DEFAULT '70', CONSTRAINT "PK_422d974e7217414e029b3e641d0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_quiz_course" ON "quiz"  ("course_id") `);
        await queryRunner.query(`CREATE TABLE "question" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quiz_id" uuid NOT NULL, "text" text NOT NULL, "order_index" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_21e5786aa0ea704ae185a79b2d5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_question_quiz" ON "question"  ("quiz_id") `);
        await queryRunner.query(`CREATE TABLE "option" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "question_id" uuid NOT NULL, "text" text NOT NULL, "is_correct" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_e6090c1c6ad8962eea97abdbe63" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_option_question" ON "option"  ("question_id") `);
        await queryRunner.query(`CREATE TABLE "quiz_attempt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "quiz_id" uuid NOT NULL, "answers" jsonb NOT NULL, "score" integer NOT NULL, "passed" boolean NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9a6c33ec08b4bcb74ca27701a94" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_quiz_attempt_user_quiz" ON "quiz_attempt"  ("user_id", "quiz_id") `);
        await queryRunner.query(`ALTER TABLE "user_achievement" ADD CONSTRAINT "FK_676d00b5a31b28beaab0617b265" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_achievement" ADD CONSTRAINT "FK_14f2bb86ac0603a47ae089b0d26" FOREIGN KEY ("achievement_id") REFERENCES "achievement"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "certificate" ADD CONSTRAINT "FK_88977bc339155e25ec30c68a9b3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "certificate" ADD CONSTRAINT "FK_5855acb3f0c9c7f287c7191cefa" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "xp_log" ADD CONSTRAINT "FK_9741891ddb0434bcacabe128ae1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notification" ADD CONSTRAINT "FK_928b7aa1754e08e1ed7052cb9d8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "quiz" ADD CONSTRAINT "FK_f865a5257529bd0a02d54c0c0b8" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "quiz" ADD CONSTRAINT "FK_7e15a3f3124282466c8a2283621" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "question" ADD CONSTRAINT "FK_aecfc55f7d8e7bb703193e03118" FOREIGN KEY ("quiz_id") REFERENCES "quiz"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "option" ADD CONSTRAINT "FK_790cf6b252b5bb48cd8fc1d272b" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "quiz_attempt" ADD CONSTRAINT "FK_337e0e7e243c6ae1f40524f9ff7" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "quiz_attempt" ADD CONSTRAINT "FK_77409c778cba55d5aa36a49a2c9" FOREIGN KEY ("quiz_id") REFERENCES "quiz"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "quiz_attempt" DROP CONSTRAINT "FK_77409c778cba55d5aa36a49a2c9"`);
        await queryRunner.query(`ALTER TABLE "quiz_attempt" DROP CONSTRAINT "FK_337e0e7e243c6ae1f40524f9ff7"`);
        await queryRunner.query(`ALTER TABLE "option" DROP CONSTRAINT "FK_790cf6b252b5bb48cd8fc1d272b"`);
        await queryRunner.query(`ALTER TABLE "question" DROP CONSTRAINT "FK_aecfc55f7d8e7bb703193e03118"`);
        await queryRunner.query(`ALTER TABLE "quiz" DROP CONSTRAINT "FK_7e15a3f3124282466c8a2283621"`);
        await queryRunner.query(`ALTER TABLE "quiz" DROP CONSTRAINT "FK_f865a5257529bd0a02d54c0c0b8"`);
        await queryRunner.query(`ALTER TABLE "notification" DROP CONSTRAINT "FK_928b7aa1754e08e1ed7052cb9d8"`);
        await queryRunner.query(`ALTER TABLE "xp_log" DROP CONSTRAINT "FK_9741891ddb0434bcacabe128ae1"`);
        await queryRunner.query(`ALTER TABLE "certificate" DROP CONSTRAINT "FK_5855acb3f0c9c7f287c7191cefa"`);
        await queryRunner.query(`ALTER TABLE "certificate" DROP CONSTRAINT "FK_88977bc339155e25ec30c68a9b3"`);
        await queryRunner.query(`ALTER TABLE "user_achievement" DROP CONSTRAINT "FK_14f2bb86ac0603a47ae089b0d26"`);
        await queryRunner.query(`ALTER TABLE "user_achievement" DROP CONSTRAINT "FK_676d00b5a31b28beaab0617b265"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_quiz_attempt_user_quiz"`);
        await queryRunner.query(`DROP TABLE "quiz_attempt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_option_question"`);
        await queryRunner.query(`DROP TABLE "option"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_question_quiz"`);
        await queryRunner.query(`DROP TABLE "question"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_quiz_course"`);
        await queryRunner.query(`DROP TABLE "quiz"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notification_user_read"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notification_user_created"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_notification_user_dedupe"`);
        await queryRunner.query(`DROP TABLE "notification"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_xp_log_user"`);
        await queryRunner.query(`DROP TABLE "xp_log"`);
        await queryRunner.query(`DROP TABLE "certificate"`);
        await queryRunner.query(`DROP TABLE "user_achievement"`);
        await queryRunner.query(`DROP TABLE "achievement"`);
    }

}
