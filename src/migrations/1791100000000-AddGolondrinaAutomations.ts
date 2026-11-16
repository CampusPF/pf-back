import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGolondrinaAutomations1791100000000 implements MigrationInterface {
    name = 'AddGolondrinaAutomations1791100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "golondrina_automations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "lesson_id" uuid NOT NULL, "action" character varying(20) NOT NULL, "channel" character varying(10) NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'active', "next_run_at" TIMESTAMP WITH TIME ZONE, "runs_left" integer NOT NULL DEFAULT 0, "runs_done" integer NOT NULL DEFAULT 0, "last_sent_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_golondrina_user_lesson_action" UNIQUE ("user_id", "lesson_id", "action"), CONSTRAINT "PK_golondrina_automations" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_golondrina_status_next_run" ON "golondrina_automations" ("status", "next_run_at") `);
        await queryRunner.query(`ALTER TABLE "golondrina_automations" ADD CONSTRAINT "FK_golondrina_automations_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "golondrina_automations" ADD CONSTRAINT "FK_golondrina_automations_lesson" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "golondrina_automations" DROP CONSTRAINT "FK_golondrina_automations_lesson"`);
        await queryRunner.query(`ALTER TABLE "golondrina_automations" DROP CONSTRAINT "FK_golondrina_automations_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_golondrina_status_next_run"`);
        await queryRunner.query(`DROP TABLE "golondrina_automations"`);
    }
}
