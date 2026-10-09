import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Desactiva "Presentate" (slug fijo: "general") del foro general: queda
 * sólo "Ayuda técnica". Igual que con "Presentaciones"/"Off-topic"
 * (ver DeactivateExtraForumCategories1790950000000), se desactiva en vez de
 * borrar: el hilo de bienvenida pineado que vive ahí
 * (AddGeneralForumWelcomeThread1790970000000) no se pierde, sólo deja de
 * listarse; el admin puede reactivarla desde el panel si hace falta.
 */
export class DeactivatePresentateForumCategory1791000000000 implements MigrationInterface {
    name = 'DeactivatePresentateForumCategory1791000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "is_active" = false WHERE "slug" = 'general'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "is_active" = true WHERE "slug" = 'general'`,
        );
    }
}
