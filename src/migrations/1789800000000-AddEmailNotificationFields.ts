import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Soporte para las notificaciones por mail:
 *  - course_enrollments.last_accessed_at: última vez que el alumno abrió una
 *    lección del curso (recordatorio semanal de inactividad).
 *  - users.email_reminders_enabled: baja de los recordatorios por mail.
 */
export class AddEmailNotificationFields1789800000000 implements MigrationInterface {
    name = 'AddEmailNotificationFields1789800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "course_enrollments" ADD "last_accessed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "IDX_course_enrollments_last_accessed_at" ON "course_enrollments" ("last_accessed_at") `);
        await queryRunner.query(`ALTER TABLE "users" ADD "email_reminders_enabled" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_reminders_enabled"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_course_enrollments_last_accessed_at"`);
        await queryRunner.query(`ALTER TABLE "course_enrollments" DROP COLUMN "last_accessed_at"`);
    }

}
