/**
 * Golondrina: las acciones de un clic que el asistente de cada lección le pasa
 * a Golondrina (el motor de avisos). Este archivo es puro, sin Nest ni base:
 * qué hace cada acción, cuándo corre y qué texto manda. Lo usan el service y
 * los tests.
 *
 * Horario: Argentina no tiene horario de verano, así que «las 19:00» son
 * siempre las 22:00 UTC. Se calcula con un offset fijo en vez de depender de
 * la zona del servidor (Render corre en UTC).
 */

export const GOLONDRINA_ACTIONS = ['recordar', 'plan', 'resumen', 'docente'] as const;
export type GolondrinaAction = (typeof GOLONDRINA_ACTIONS)[number];

export const GOLONDRINA_CHANNELS = ['push', 'email', 'in_app'] as const;
export type GolondrinaChannel = (typeof GOLONDRINA_CHANNELS)[number];

export type GolondrinaStatus = 'active' | 'done' | 'cancelled';

/** Offset de Argentina respecto de UTC, en minutos. */
export const AR_OFFSET_MINUTES = -180;

/** Bloques del plan de estudio: cada 48 h, tres veces. */
export const PLAN_BLOCKS = [
    { minutes: 20, what: 'Releer la lección' },
    { minutes: 20, what: 'Practicar con el tutor' },
    { minutes: 15, what: 'Quiz rápido de repaso' },
] as const;
export const PLAN_INTERVAL_HOURS = 48;

/**
 * Instante UTC de «dentro de `days` días a las hh:mm de Argentina», contado
 * desde el día argentino de `now`.
 */
export function arLocalAt(now: Date, days: number, hour: number, minute = 0): Date {
    const arNow = new Date(now.getTime() + AR_OFFSET_MINUTES * 60_000);
    const target = Date.UTC(
        arNow.getUTCFullYear(),
        arNow.getUTCMonth(),
        arNow.getUTCDate() + days,
        hour,
        minute,
    );
    return new Date(target - AR_OFFSET_MINUTES * 60_000);
}

export interface Schedule {
    /** Primera corrida (null = la dispara un evento, no el reloj). */
    nextRunAt: Date | null;
    /** Cuántas corridas quedan contando la primera. 0 = sin límite (eventos). */
    runsLeft: number;
}

export function scheduleFor(action: GolondrinaAction, now: Date): Schedule {
    switch (action) {
        case 'recordar':
            return { nextRunAt: arLocalAt(now, 1, 19), runsLeft: 1 };
        case 'plan':
            // 18:45: el aviso dice «en 15 minutos tenés tu bloque» de las 19:00.
            return { nextRunAt: arLocalAt(now, 1, 18, 45), runsLeft: PLAN_BLOCKS.length };
        case 'resumen':
            return { nextRunAt: now, runsLeft: 1 };
        case 'docente':
            return { nextRunAt: null, runsLeft: 0 };
    }
}

/** Siguiente corrida después de una que acaba de salir, o null si terminó. */
export function nextAfterRun(action: GolondrinaAction, ranAt: Date, runsLeftAfter: number): Date | null {
    if (action !== 'plan' || runsLeftAfter <= 0) return null;
    return new Date(ranAt.getTime() + PLAN_INTERVAL_HOURS * 3_600_000);
}

/**
 * Hasta cinco puntos clave del contenido markdown de una lección: los títulos
 * de sección y, si no alcanzan, la primera oración de cada párrafo. Sin IA: es
 * un resumen para refrescar la memoria, no para reemplazar la lección.
 */
export function summarizeLesson(markdown: string | null | undefined, max = 5): string[] {
    if (!markdown) return [];
    const clean = (s: string) =>
        s
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[*_`>#]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

    const lines = markdown.split(/\r?\n/);
    const headings = lines
        .filter((l) => /^#{2,3}\s+/.test(l))
        .map(clean)
        .filter(Boolean);
    if (headings.length >= 3) return headings.slice(0, max);

    const sentences = markdown
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter((block) => block && !/^(#|```|\||-|\*|\d+\.)/.test(block))
        .map((block) => clean(block).split(/(?<=[.!?])\s/)[0])
        .filter((s) => s.length > 20);
    return [...headings, ...sentences].slice(0, max);
}

export interface Message {
    title: string;
    body: string;
    /** Puntos extra, sólo para el mail (el push y la campanita no los muestran). */
    items: string[];
}

export function messageFor(
    action: GolondrinaAction,
    lessonTitle: string,
    opts: { runIndex?: number; summary?: string[] } = {},
): Message {
    switch (action) {
        case 'recordar':
            return {
                title: 'Hoy toca repasar',
                body: `Repasá «${lessonTitle}». Son 10 minutos, ¿arrancamos?`,
                items: [],
            };
        case 'plan': {
            const block = PLAN_BLOCKS[Math.min(opts.runIndex ?? 0, PLAN_BLOCKS.length - 1)];
            return {
                title: 'En 15 minutos, tu bloque de estudio',
                body: `${block.what} de «${lessonTitle}» (${block.minutes} min).`,
                items: [],
            };
        }
        case 'resumen': {
            const summary = opts.summary ?? [];
            return {
                title: `Resumen de «${lessonTitle}»`,
                body: summary.length
                    ? summary.join(' · ')
                    : 'Esta lección no tiene texto para resumir: abrila para ver el video.',
                items: summary,
            };
        }
        case 'docente':
            return {
                title: 'Te respondió el docente',
                body: `El docente contestó tu pregunta. La lección era «${lessonTitle}».`,
                items: [],
            };
    }
}
