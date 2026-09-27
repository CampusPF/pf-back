import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDirectChats1790504383013 implements MigrationInterface {
    name = 'AddDirectChats1790504383013'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_conversations_course"`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ADD "student_id" uuid`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" DROP CONSTRAINT "FK_66251fa72e6bcee00d492d7ab6d"`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ALTER COLUMN "type" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ALTER COLUMN "course_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ADD CONSTRAINT "FK_66251fa72e6bcee00d492d7ab6d" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ADD CONSTRAINT "FK_02ca635256d7c7332f3abba1fa3" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_conversations" DROP CONSTRAINT "FK_02ca635256d7c7332f3abba1fa3"`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" DROP CONSTRAINT "FK_66251fa72e6bcee00d492d7ab6d"`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ALTER COLUMN "course_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ALTER COLUMN "type" SET DEFAULT 'course'`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ADD CONSTRAINT "FK_66251fa72e6bcee00d492d7ab6d" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" DROP COLUMN "student_id"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_conversations_course" ON "chat_conversations" USING btree ("course_id") `);
    }

}
