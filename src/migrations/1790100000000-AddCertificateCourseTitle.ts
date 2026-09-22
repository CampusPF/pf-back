import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * certificate.course_title: el título del curso impreso en el PDF. Sirve para
 * detectar que el curso se renombró y regenerar el certificado. Queda null en
 * los existentes, que se regeneran solos la primera vez que se listan.
 */
export class AddCertificateCourseTitle1790100000000 implements MigrationInterface {
    name = 'AddCertificateCourseTitle1790100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "certificate" ADD "course_title" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "certificate" DROP COLUMN "course_title"`);
    }

}
