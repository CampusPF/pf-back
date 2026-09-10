import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLessonDurationAndFree1789032109304 implements MigrationInterface {
    name = 'AddLessonDurationAndFree1789032109304'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lessons" ADD "duration_minutes" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "lessons" ADD "is_free" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lessons" DROP COLUMN "is_free"`);
        await queryRunner.query(`ALTER TABLE "lessons" DROP COLUMN "duration_minutes"`);
    }

}
