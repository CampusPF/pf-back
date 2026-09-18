import { DataSource } from 'typeorm';
import { Achievement } from '../../achievements/entities/achievement.entity';

/**
 * Catálogo de logros.
 *
 * `code` es la clave estable: el front la usa para elegir el ícono y el back
 * para el upsert. El nombre y la descripción se pueden editar sin romper nada;
 * el code no se toca una vez publicado.
 *
 * `condition` la interpreta AchievementsService.checkCondition — si se agrega
 * un `type` nuevo acá, hay que sumarlo también a ese switch o el logro no se
 * desbloquea nunca.
 */
const ACHIEVEMENTS: Array<Partial<Achievement>> = [
    {
        code: 'first_lesson',
        name: 'Primer paso',
        description: 'Completaste tu primera lección',
        icon: 'footprints',
        condition: { type: 'lessons_completed', value: 1 },
    },
    {
        code: 'ten_lessons',
        name: 'En marcha',
        description: 'Completaste 10 lecciones',
        icon: 'flame',
        condition: { type: 'lessons_completed', value: 10 },
    },
    {
        code: 'first_course',
        name: 'Graduado',
        description: 'Completaste tu primer curso',
        icon: 'graduation-cap',
        condition: { type: 'courses_completed', value: 1 },
    },
    {
        code: 'three_courses',
        name: 'Coleccionista',
        description: 'Completaste 3 cursos',
        icon: 'trophy',
        condition: { type: 'courses_completed', value: 3 },
    },
    {
        code: 'streak_3',
        name: 'Constancia',
        description: 'Racha de 3 días seguidos',
        icon: 'fire',
        condition: { type: 'streak_days', value: 3 },
    },
    {
        code: 'streak_7',
        name: 'Imparable',
        description: 'Racha de 7 días seguidos',
        icon: 'fire',
        condition: { type: 'streak_days', value: 7 },
    },
    {
        code: 'first_certificate',
        name: 'Certificado',
        description: 'Obtuviste tu primer certificado',
        icon: 'award',
        condition: { type: 'certificates_issued', value: 1 },
    },
    {
        code: 'level_5',
        name: 'Veterano',
        description: 'Llegaste al nivel 5',
        icon: 'star',
        condition: { type: 'level_reached', value: 5 },
    },
];

/**
 * Idempotente: se puede correr todas las veces que haga falta.
 *
 * Es un UPDATE sobre `code` y no un "borrar todo e insertar": las filas de
 * `user_achievement` apuntan al id del logro, así que recrearlos le borraría
 * los logros a todos los usuarios (la FK es ON DELETE CASCADE).
 */
export async function seedAchievements(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(Achievement);

    for (const achievement of ACHIEVEMENTS) {
        const existing = await repo.findOne({ where: { code: achievement.code } });

        // save() con id hace UPDATE y sin id hace INSERT: en los dos casos se
        // conserva el id existente, que es lo que importa.
        await repo.save(repo.create({ ...achievement, id: existing?.id }));
    }

    console.log(`🏅 Logros sembrados: ${ACHIEVEMENTS.length}`);
}
