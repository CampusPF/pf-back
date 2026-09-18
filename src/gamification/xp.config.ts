import { CourseDifficulty } from '../courses/entities/course.entity';

/**
 * Cuánto multiplica la dificultad del curso el XP de cada acción.
 *
 * Las claves son los valores REALES del enum CourseDifficulty ('beginner',
 * 'intermediate', 'advanced'), no español: la columna `difficulty` de `courses`
 * es un enum de Postgres con esos tres valores y es lo que llega acá.
 */
export const DIFFICULTY_MULTIPLIER: Record<CourseDifficulty, number> = {
    [CourseDifficulty.BEGINNER]: 1,
    [CourseDifficulty.INTERMEDIATE]: 1.5,
    [CourseDifficulty.ADVANCED]: 2,
};

/** XP base por completar una lección, antes del multiplicador de dificultad. */
export const XP_PER_LESSON = 10;

/** XP por terminar un curso: una parte fija más otra por lección del curso. */
export const XP_COURSE_BASE = 50;
export const XP_COURSE_PER_LESSON = 5;

/**
 * XP acumulado necesario para cada nivel. El índice es el nivel menos uno:
 * LEVEL_THRESHOLDS[0] = 0 es el nivel 1, LEVEL_THRESHOLDS[1] = 100 es el 2.
 *
 * Al pasar el último umbral el nivel deja de subir: el nivel 10 es el techo
 * actual, y `xpForNextLevel` devuelve null para que el front sepa que no hay
 * barra de progreso que mostrar.
 */
export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

export interface LevelInfo {
    level: number;
    /** XP acumulado dentro del nivel actual (para la barra de progreso). */
    xpIntoLevel: number;
    /** XP que mide el nivel actual de punta a punta. null en el nivel máximo. */
    xpForNextLevel: number | null;
}

export function getLevelFromXp(xp: number): LevelInfo {
    let level = 1;
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
        if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
        else break;
    }

    const currentThreshold = LEVEL_THRESHOLDS[level - 1];
    const nextThreshold = LEVEL_THRESHOLDS[level] ?? null;

    return {
        level,
        xpIntoLevel: xp - currentThreshold,
        xpForNextLevel: nextThreshold !== null ? nextThreshold - currentThreshold : null,
    };
}
