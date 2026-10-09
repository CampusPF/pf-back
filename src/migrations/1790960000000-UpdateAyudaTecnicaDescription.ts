import { MigrationInterface, QueryRunner } from "typeorm";

/** Ajusta el copy de la categoría "Ayuda técnica" del foro general. */
export class UpdateAyudaTecnicaDescription1790960000000 implements MigrationInterface {
    name = 'UpdateAyudaTecnicaDescription1790960000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "description" = $1 WHERE "slug" = 'ayuda-tecnica'`,
            ['Problemas con la plataforma, algún video que no cargue o la cuenta.'],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "description" = $1 WHERE "slug" = 'ayuda-tecnica'`,
            ['Problemas con la plataforma, el video o la cuenta.'],
        );
    }
}
