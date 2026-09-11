import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCloudinaryAssets1789086252274 implements MigrationInterface {
    name = 'AddCloudinaryAssets1789086252274'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "lesson_resources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "public_id" character varying NOT NULL, "size_bytes" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lessonId" uuid, CONSTRAINT "PK_d386430b2dbe4798fdd3c558d8b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "imagePublicId" character varying`);
        await queryRunner.query(`ALTER TABLE "courses" ADD "image_public_id" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatar_url" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatar_public_id" character varying`);
        await queryRunner.query(`ALTER TABLE "lesson_resources" ADD CONSTRAINT "FK_6cbd79184196460ee2ee07ba54c" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lesson_resources" DROP CONSTRAINT "FK_6cbd79184196460ee2ee07ba54c"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_public_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
        await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN "image_public_id"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "imagePublicId"`);
        await queryRunner.query(`DROP TABLE "lesson_resources"`);
    }

}
