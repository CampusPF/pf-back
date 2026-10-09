import { MigrationInterface, QueryRunner } from "typeorm";

/** Segundo ajuste de copy de "Ayuda técnica". */
export class UpdateAyudaTecnicaDescriptionAgain1790990000000 implements MigrationInterface {
    name = 'UpdateAyudaTecnicaDescriptionAgain1790990000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "description" = $1 WHERE "slug" = 'ayuda-tecnica'`,
            ['Problemas con la plataforma, algún video que no cargue o algo con tu cuenta.'],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "description" = $1 WHERE "slug" = 'ayuda-tecnica'`,
            ['Problemas con la plataforma, algún video que no cargue o la cuenta.'],
        );
    }
}
