import { MigrationInterface, QueryRunner } from "typeorm";

const TITLE = 'Presentate: contanos quién sos y qué estás estudiando';
const BODY =
    '¡Bienvenido/a a la comunidad! Contanos un poco sobre vos: tu nombre, qué curso estás haciendo (o cuál pensás arrancar) y qué esperás aprender. Así el resto te conoce y podés encontrar compañeros con tus mismos intereses.';

/**
 * Hilo de bienvenida fijado en "General", en reemplazo de la categoría
 * "Presentaciones" que se dio de baja. Se crea con el primer ADMIN que
 * encuentre (si no hay ninguno todavía, el INSERT no hace nada: el SELECT de
 * autor no devuelve filas y el JOIN lo filtra) para que quede autoría de la
 * plataforma, no de un usuario cualquiera.
 *
 * Queda `is_pinned = true` y `is_locked = false` a propósito: es el único
 * hilo que NO se debe cerrar nunca. Como moderateThread() ya no permite
 * reabrir un hilo cerrado (ver ForumsService), cerrarlo por error lo dejaría
 * así para siempre — ni el admin lo revierte desde la UI. Si hiciera falta
 * reabrirlo, es un UPDATE manual en la base.
 */
export class AddGeneralForumWelcomeThread1790970000000 implements MigrationInterface {
    name = 'AddGeneralForumWelcomeThread1790970000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO "forum_threads"
                ("category_id", "author_id", "title", "body", "is_pinned", "is_locked", "last_activity_at")
             SELECT c."id", u."id", $1, $2, true, false, now()
             FROM "forum_categories" c
             CROSS JOIN LATERAL (
                 SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "createdAt" ASC LIMIT 1
             ) u
             WHERE c."slug" = 'general'`,
            [TITLE, BODY],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM "forum_threads"
             WHERE "title" = $1
               AND "category_id" = (SELECT "id" FROM "forum_categories" WHERE "slug" = 'general')`,
            [TITLE],
        );
    }
}
