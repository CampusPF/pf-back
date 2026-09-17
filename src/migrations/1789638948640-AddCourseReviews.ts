import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCourseReviews1789638948640 implements MigrationInterface {
    name = 'AddCourseReviews1789638948640'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "course_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "course_id" uuid NOT NULL, "rating" smallint NOT NULL, "comment" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_course_reviews_user_course" UNIQUE ("user_id", "course_id"), CONSTRAINT "CHK_course_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5), CONSTRAINT "PK_2dc117d5b688a2040125a09d1f1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_course_reviews_course_created" ON "course_reviews"  ("course_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "course_reviews" ADD CONSTRAINT "FK_4f144342761fa0c6c3f129da76c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "course_reviews" ADD CONSTRAINT "FK_1f69fdcbd7ea5f0e52c3230c00b" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "course_reviews" DROP CONSTRAINT "FK_1f69fdcbd7ea5f0e52c3230c00b"`);
        await queryRunner.query(`ALTER TABLE "course_reviews" DROP CONSTRAINT "FK_4f144342761fa0c6c3f129da76c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_course_reviews_course_created"`);
        await queryRunner.query(`DROP TABLE "course_reviews"`);
    }

}
