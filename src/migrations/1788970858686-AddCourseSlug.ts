import { MigrationInterface, QueryRunner } from "typeorm";
import { slugify } from "../courses/utils/slug.util";

/**
 * Course: columna `slug` (identificador para URLs del front).
 *
 * Se agrega primero como nullable, se hace backfill de las filas existentes
 * derivando el slug del título (con sufijo numérico ante colisiones) y recién
 * después se pone NOT NULL + UNIQUE.
 */
export class AddCourseSlug1788970858686 implements MigrationInterface {
    name = 'AddCourseSlug1788970858686'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "courses" ADD "slug" character varying`);

        // --- Backfill de filas existentes ---
        const rows: { id: string; title: string }[] = await queryRunner.query(
            `SELECT "id", "title" FROM "courses" ORDER BY "createdAt" ASC`,
        );
        const used = new Set<string>();
        for (const row of rows) {
            const root = slugify(row.title) || 'curso';
            let candidate = root;
            let suffix = 2;
            while (used.has(candidate)) {
                candidate = `${root}-${suffix}`;
                suffix += 1;
            }
            used.add(candidate);
            await queryRunner.query(`UPDATE "courses" SET "slug" = $1 WHERE "id" = $2`, [
                candidate,
                row.id,
            ]);
        }

        await queryRunner.query(`ALTER TABLE "courses" ALTER COLUMN "slug" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "courses" ADD CONSTRAINT "UQ_courses_slug" UNIQUE ("slug")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "courses" DROP CONSTRAINT "UQ_courses_slug"`);
        await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN "slug"`);
    }
}
