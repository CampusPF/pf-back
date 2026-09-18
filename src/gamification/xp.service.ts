import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { XpLog } from './entities/xp-log.entity';

@Injectable()
export class XpService {
    constructor(
        @InjectRepository(XpLog)
        private readonly xpLogRepository: Repository<XpLog>,
    ) { }

    /**
     * Registra un movimiento de XP.
     *
     * `reason` no es sólo un texto para auditar: es la CLAVE DE IDEMPOTENCIA.
     * Formato "<acción>:<id>", por ejemplo "lesson_completed:<lessonId>". Un
     * índice único sobre (user_id, reason) respalda el `orIgnore()`, así que
     * el mismo hecho nunca suma XP dos veces.
     *
     * Hace falta porque LESSON_COMPLETED se vuelve a emitir si el alumno
     * desmarca una lección y la vuelve a marcar (ver LessonProgressService).
     * Sin esta guarda, pasar dos veces por ahí duplicaría el XP, y con un
     * script que desmarque y marque en loop se podría inflar el nivel.
     */
    async addXp(userId: string, amount: number, reason: string): Promise<void> {
        await this.xpLogRepository
            .createQueryBuilder()
            .insert()
            .into(XpLog)
            .values({ userId, amount, reason })
            .orIgnore()
            .execute();
    }

    /**
     * XP total del usuario: la suma de su historial.
     *
     * No hay un contador guardado en `users` a propósito — mismo criterio que
     * la racha. El total siempre se puede recalcular desde las filas, y si
     * mañana cambia cuánto vale una acción, se recalcula sin migrar nada.
     */
    async getTotalXp(userId: string): Promise<number> {
        const result = await this.xpLogRepository
            .createQueryBuilder('log')
            .where('log.userId = :userId', { userId })
            .select('COALESCE(SUM(log.amount), 0)', 'total')
            .getRawOne<{ total: string }>();

        // SUM() de Postgres vuelve como string (bigint).
        return Number(result?.total ?? 0);
    }
}
