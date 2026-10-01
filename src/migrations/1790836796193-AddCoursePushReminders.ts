import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCoursePushReminders1790836796193 implements MigrationInterface {
    name = 'AddCoursePushReminders1790836796193'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "course_push_reminders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "course_id" uuid NOT NULL, "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1d3c7170ecd4caa8de08c21794e" UNIQUE ("user_id", "course_id"), CONSTRAINT "PK_e82f14f494a2c81b865e14ebe27" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_course_push_reminders_last_sent_at" ON "course_push_reminders"  ("last_sent_at") `);
        await queryRunner.query(`ALTER TABLE "course_push_reminders" ADD CONSTRAINT "FK_3b51142369c7d539e00d843310a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "course_push_reminders" ADD CONSTRAINT "FK_774104b8476ac1cf59ade9a8a19" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "course_push_reminders" DROP CONSTRAINT "FK_774104b8476ac1cf59ade9a8a19"`);
        await queryRunner.query(`ALTER TABLE "course_push_reminders" DROP CONSTRAINT "FK_3b51142369c7d539e00d843310a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_course_push_reminders_last_sent_at"`);
        await queryRunner.query(`DROP TABLE "course_push_reminders"`);
    }
}
