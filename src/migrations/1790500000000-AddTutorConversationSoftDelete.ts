import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ai_tutor_conversations.deleted_at: "vaciar conversación" pasa a ser borrado
 * lógico. Antes se borraban las filas y con ellas los mensajes, así que el
 * contador diario del plan Free volvía atrás y el límite se podía esquivar.
 */
export class AddTutorConversationSoftDelete1790500000000 implements MigrationInterface {
    name = 'AddTutorConversationSoftDelete1790500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_tutor_conversations" ADD "deleted_at" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_tutor_conversations" DROP COLUMN "deleted_at"`);
    }

}
