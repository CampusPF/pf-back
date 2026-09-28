import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChatMessages1790395866018 implements MigrationInterface {
    name = 'AddChatMessages1790395866018'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sender_id" uuid NOT NULL, "receiver_id" uuid NOT NULL, "content" text NOT NULL, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_messages_receiver_read_at" ON "messages"  ("receiver_id", "read_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_messages_sender_receiver_created" ON "messages"  ("sender_id", "receiver_id", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_messages_sender_receiver_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_messages_receiver_read_at"`);
        await queryRunner.query(`DROP TABLE "messages"`);
    }

}
