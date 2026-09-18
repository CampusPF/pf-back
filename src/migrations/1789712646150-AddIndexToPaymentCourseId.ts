import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIndexToPaymentCourseId1789712646150 implements MigrationInterface {
    name = 'AddIndexToPaymentCourseId1789712646150'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_00097d3b3147848e3585aabb43" ON "payments"  ("courseId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_00097d3b3147848e3585aabb43"`);
    }

}
