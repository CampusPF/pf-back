import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCourseDeactivatedByAdmin1790068171152 implements MigrationInterface {
    name = 'AddCourseDeactivatedByAdmin1790068171152'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "courses" ADD "deactivated_by_admin" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN "deactivated_by_admin"`);
    }

}
