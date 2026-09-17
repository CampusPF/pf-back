import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserActivity1789633984360 implements MigrationInterface {
    name = 'AddUserActivity1789633984360'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_activity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "date" date NOT NULL, CONSTRAINT "UQ_user_activity_user_date" UNIQUE ("user_id", "date"), CONSTRAINT "PK_daec6d19443689bda7d7785dff5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user_activity" ADD CONSTRAINT "FK_11108754ec780c670440e32baad" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_activity" DROP CONSTRAINT "FK_11108754ec780c670440e32baad"`);
        await queryRunner.query(`DROP TABLE "user_activity"`);
    }

}
