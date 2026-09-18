import {
    getLevelFromXp,
    LEVEL_THRESHOLDS,
    DIFFICULTY_MULTIPLIER,
} from './xp.config';
import { CourseDifficulty } from '../courses/entities/course.entity';

/**
 * El nivel no se guarda en ningún lado: se deriva del XP cada vez que se pide.
 * Si esta función se equivoca, el dashboard entero muestra mal el nivel y la
 * barra de progreso, así que se testean los bordes.
 */
describe('getLevelFromXp', () => {
    it('empieza en nivel 1 con 0 XP', () => {
        expect(getLevelFromXp(0)).toEqual({
            level: 1,
            xpIntoLevel: 0,
            xpForNextLevel: 100,
        });
    });

    it('sube de nivel justo al alcanzar el umbral, no antes', () => {
        expect(getLevelFromXp(99).level).toBe(1);
        expect(getLevelFromXp(100).level).toBe(2);
        expect(getLevelFromXp(249).level).toBe(2);
        expect(getLevelFromXp(250).level).toBe(3);
    });

    it('informa el progreso DENTRO del nivel, no el XP total', () => {
        // 160 XP es nivel 2 (umbral 100), con 60 hechos de los 150 que mide.
        expect(getLevelFromXp(160)).toEqual({
            level: 2,
            xpIntoLevel: 60,
            xpForNextLevel: 150,
        });
    });

    it('en el nivel máximo no hay siguiente nivel', () => {
        const topXp = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
        const info = getLevelFromXp(topXp);

        expect(info.level).toBe(LEVEL_THRESHOLDS.length);
        // null es lo que le dice al front que no dibuje barra de progreso.
        expect(info.xpForNextLevel).toBeNull();
    });

    it('no rompe con XP por encima del último umbral', () => {
        const info = getLevelFromXp(99999);
        expect(info.level).toBe(LEVEL_THRESHOLDS.length);
        expect(info.xpForNextLevel).toBeNull();
    });
});

describe('DIFFICULTY_MULTIPLIER', () => {
    /**
     * Las claves tienen que ser los valores REALES del enum de la entidad
     * ('beginner'/'intermediate'/'advanced'). Si alguien las escribe en
     * español, `DIFFICULTY_MULTIPLIER[course.difficulty]` da undefined y todos
     * los cursos pasan a valer el multiplicador por defecto en silencio.
     */
    it('cubre las tres dificultades del enum Course', () => {
        for (const difficulty of Object.values(CourseDifficulty)) {
            expect(DIFFICULTY_MULTIPLIER[difficulty]).toBeGreaterThan(0);
        }
    });

    it('un curso más difícil da más XP', () => {
        expect(DIFFICULTY_MULTIPLIER[CourseDifficulty.INTERMEDIATE]).toBeGreaterThan(
            DIFFICULTY_MULTIPLIER[CourseDifficulty.BEGINNER],
        );
        expect(DIFFICULTY_MULTIPLIER[CourseDifficulty.ADVANCED]).toBeGreaterThan(
            DIFFICULTY_MULTIPLIER[CourseDifficulty.INTERMEDIATE],
        );
    });
});
