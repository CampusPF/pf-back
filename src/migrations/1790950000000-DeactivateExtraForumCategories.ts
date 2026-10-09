import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Se queda sólo "General" y "Ayuda técnica": desactiva "Presentaciones" y
 * "Off-topic" en vez de borrarlas (el FK de forum_threads.category_id es
 * ON DELETE CASCADE, así que borrar la categoría borraría sus hilos). Con
 * isActive=false deja de listarse (ForumCategoriesService.findActive) pero
 * los hilos viejos siguen existiendo y el admin puede reactivarla desde el
 * panel si hace falta.
 */
export class DeactivateExtraForumCategories1790950000000 implements MigrationInterface {
    name = 'DeactivateExtraForumCategories1790950000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "is_active" = false WHERE "slug" IN ('presentaciones', 'off-topic')`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "forum_categories" SET "is_active" = true WHERE "slug" IN ('presentaciones', 'off-topic')`,
        );
    }
}
