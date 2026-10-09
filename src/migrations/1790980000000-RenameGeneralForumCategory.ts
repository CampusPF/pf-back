import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Renombra la categoría "General" (slug fijo: "general", no cambia) a
 * "Presentate" / "Contanos de vos" — queda como el lugar para presentarse,
 * en línea con el hilo pineado que ya vive ahí.
 */
export class RenameGeneralForumCategory1790980000000 implements MigrationInterface {
    name = 'RenameGeneralForumCategory1790980000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "name" = $1, "description" = $2 WHERE "slug" = 'general'`,
            ['Presentate', 'Contanos de vos'],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "name" = $1, "description" = $2 WHERE "slug" = 'general'`,
            ['General', 'Charlas generales de la comunidad.'],
        );
    }
}
