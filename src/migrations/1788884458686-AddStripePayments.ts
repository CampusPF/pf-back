import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stripe: precio en Course + tabla payments.
 *
 * Nombres de constraints/índices puestos a mano (legibles) en vez de los
 * hashes que genera `migration:generate`. Si en el futuro se regenera una
 * migración, TypeORM puede proponer un rename cosmético: se puede descartar.
 */
export class AddStripePayments1788884458686 implements MigrationInterface {
    name = 'AddStripePayments1788884458686'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- Course: precio ---
        await queryRunner.query(`ALTER TABLE "courses" ADD "price_in_cents" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "courses" ADD "currency" character varying(3) NOT NULL DEFAULT 'usd'`);

        // --- Enums de payments ---
        await queryRunner.query(`CREATE TYPE "public"."payments_type_enum" AS ENUM('course', 'subscription')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_plan_enum" AS ENUM('free', 'premium')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'succeeded', 'failed')`);

        // --- Tabla payments ---
        await queryRunner.query(`
            CREATE TABLE "payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "type" "public"."payments_type_enum" NOT NULL,
                "plan" "public"."payments_plan_enum",
                "stripe_payment_intent_id" character varying NOT NULL,
                "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending',
                "amount_in_cents" integer NOT NULL,
                "currency" character varying(3) NOT NULL DEFAULT 'usd',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid NOT NULL,
                "courseId" uuid,
                CONSTRAINT "PK_payments" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_payments_stripe_payment_intent_id" ON "payments" ("stripe_payment_intent_id")`);

        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_course" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_course"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payments_stripe_payment_intent_id"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_plan_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_type_enum"`);
        await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN "currency"`);
        await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN "price_in_cents"`);
    }
}
