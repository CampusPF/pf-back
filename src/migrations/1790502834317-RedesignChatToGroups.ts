import { MigrationInterface, QueryRunner } from "typeorm";

export class RedesignChatToGroups1790502834317 implements MigrationInterface {
    name = 'RedesignChatToGroups1790502834317'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_messages_receiver_read_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_messages_sender_receiver_created"`);
        await queryRunner.query(`CREATE TABLE "chat_participants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "user_id" uuid NOT NULL, "last_read_at" TIMESTAMP WITH TIME ZONE, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ebf68c52a2b4dceb777672b782d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_chat_participants_user" ON "chat_participants"  ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_participants_conversation_user" ON "chat_participants"  ("conversation_id", "user_id") `);
        await queryRunner.query(`CREATE TABLE "chat_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying(20) NOT NULL DEFAULT 'course', "course_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ff117d9f57807c4f2e3034a39f3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_conversations_course" ON "chat_conversations"  ("course_id") `);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "receiver_id"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "read_at"`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "conversation_id" uuid NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_messages_conversation_created" ON "messages"  ("conversation_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "chat_participants" ADD CONSTRAINT "FK_fb3a8029a2688a74971e918df79" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_participants" ADD CONSTRAINT "FK_b4129b3e21906ca57b503a1d834" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_conversations" ADD CONSTRAINT "FK_66251fa72e6bcee00d492d7ab6d" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_conversations" DROP CONSTRAINT "FK_66251fa72e6bcee00d492d7ab6d"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`);
        await queryRunner.query(`ALTER TABLE "chat_participants" DROP CONSTRAINT "FK_b4129b3e21906ca57b503a1d834"`);
        await queryRunner.query(`ALTER TABLE "chat_participants" DROP CONSTRAINT "FK_fb3a8029a2688a74971e918df79"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_messages_conversation_created"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "conversation_id"`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "read_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "receiver_id" uuid NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_conversations_course"`);
        await queryRunner.query(`DROP TABLE "chat_conversations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_participants_conversation_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_participants_user"`);
        await queryRunner.query(`DROP TABLE "chat_participants"`);
        await queryRunner.query(`CREATE INDEX "IDX_messages_sender_receiver_created" ON "messages" USING btree ("created_at", "receiver_id", "sender_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_messages_receiver_read_at" ON "messages" USING btree ("read_at", "receiver_id") `);
    }

}
