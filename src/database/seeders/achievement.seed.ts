import { DataSource } from 'typeorm';
import { Achievement } from '../../achievements/entities/achievement.entity';

/**
 * Catálogo de logros.
 *
 * `code` es la clave estable: el front la usa para elegir el ícono y el back
 * para el upsert. El nombre y la descripción se pueden editar sin romper nada;
 * el code no se toca una vez publicado.
 *
 * `condition.type` tiene que ser una de ACHIEVEMENT_METRICS
 * (achievements/achievement-metrics.service.ts): un type desconocido no rompe,
 * pero ese logro no se desbloquea nunca. Las descripciones están en
 * imperativo porque el front las muestra como "qué tenés que hacer" en los
 * bloqueados.
 */
const ACHIEVEMENTS: Array<Partial<Achievement>> = [
    {
        code: 'first_lesson',
        name: 'Primer paso',
        description: 'Completá tu primera lección',
        icon: 'footprints',
        condition: { type: 'lessons_completed', value: 1 },
    },
    {
        code: 'ten_lessons',
        name: 'En marcha',
        description: 'Completá 10 lecciones',
        icon: 'flame',
        condition: { type: 'lessons_completed', value: 10 },
    },
    {
        code: 'lessons_25',
        name: 'Maratonista',
        description: 'Completá 25 lecciones',
        icon: 'book-open',
        condition: { type: 'lessons_completed', value: 25 },
    },
    {
        code: 'lessons_50',
        name: 'Incansable',
        description: 'Completá 50 lecciones',
        icon: 'rocket',
        condition: { type: 'lessons_completed', value: 50 },
    },
    {
        code: 'first_enrollment',
        name: 'Manos a la obra',
        description: 'Inscribite en tu primer curso',
        icon: 'compass',
        condition: { type: 'courses_enrolled', value: 1 },
    },
    {
        code: 'first_course',
        name: 'Graduado',
        description: 'Terminá tu primer curso',
        icon: 'graduation-cap',
        condition: { type: 'courses_completed', value: 1 },
    },
    {
        code: 'three_courses',
        name: 'Coleccionista',
        description: 'Terminá 3 cursos',
        icon: 'trophy',
        condition: { type: 'courses_completed', value: 3 },
    },
    {
        code: 'streak_3',
        name: 'Constancia',
        description: 'Estudiá 3 días seguidos',
        icon: 'fire',
        condition: { type: 'streak_days', value: 3 },
    },
    {
        code: 'streak_7',
        name: 'Imparable',
        description: 'Estudiá 7 días seguidos',
        icon: 'fire',
        condition: { type: 'streak_days', value: 7 },
    },
    {
        code: 'streak_30',
        name: 'Hábito de hierro',
        description: 'Estudiá 30 días seguidos',
        icon: 'calendar-check',
        condition: { type: 'streak_days', value: 30 },
    },
    {
        code: 'first_quiz',
        name: 'Aprobado',
        description: 'Aprobá tu primer checkpoint',
        icon: 'badge-check',
        condition: { type: 'quizzes_passed', value: 1 },
    },
    {
        code: 'quizzes_5',
        name: 'Mente afilada',
        description: 'Aprobá 5 checkpoints',
        icon: 'brain',
        condition: { type: 'quizzes_passed', value: 5 },
    },
    {
        code: 'study_1h',
        name: 'Primera hora',
        description: 'Sumá 1 hora de estudio',
        icon: 'clock',
        condition: { type: 'studied_minutes', value: 60 },
    },
    {
        code: 'study_10h',
        name: 'Diez horas',
        description: 'Sumá 10 horas de estudio',
        icon: 'hourglass',
        condition: { type: 'studied_minutes', value: 600 },
    },
    {
        code: 'first_certificate',
        name: 'Certificado',
        description: 'Obtené tu primer certificado',
        icon: 'award',
        condition: { type: 'certificates_issued', value: 1 },
    },
    {
        code: 'certificates_3',
        name: 'Vitrina llena',
        description: 'Obtené 3 certificados',
        icon: 'medal',
        condition: { type: 'certificates_issued', value: 3 },
    },
    {
        code: 'level_5',
        name: 'Veterano',
        description: 'Llegá al nivel 5',
        icon: 'star',
        condition: { type: 'level_reached', value: 5 },
    },
    {
        code: 'level_10',
        name: 'Leyenda',
        description: 'Llegá al nivel 10, el máximo',
        icon: 'crown',
        condition: { type: 'level_reached', value: 10 },
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
