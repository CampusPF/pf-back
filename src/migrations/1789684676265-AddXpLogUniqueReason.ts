import { MigrationInterface, QueryRunner } from "typeorm";

export class AddXpLogUniqueReason1789684676265 implements MigrationInterface {
    name = 'AddXpLogUniqueReason1789684676265'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "xp_log" ADD CONSTRAINT "UQ_xp_log_user_reason" UNIQUE ("user_id", "reason")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "xp_log" DROP CONSTRAINT "UQ_xp_log_user_reason"`);
    }

}
