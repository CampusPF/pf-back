import { arLocalAt, messageFor, nextAfterRun, scheduleFor, summarizeLesson } from './golondrina.actions';
import { finishRun } from './golondrina.service';

describe('arLocalAt', () => {
    it('las 19:00 de mañana en Argentina son las 22:00 UTC', () => {
        // 10/11 15:00 en Argentina (18:00 UTC)
        const now = new Date('2026-11-10T18:00:00Z');
        expect(arLocalAt(now, 1, 19).toISOString()).toBe('2026-11-11T22:00:00.000Z');
    });

    it('cuenta desde el día argentino aunque en UTC ya sea mañana', () => {
        // 10/11 23:30 en Argentina = 11/11 02:30 UTC
        const now = new Date('2026-11-11T02:30:00Z');
        expect(arLocalAt(now, 1, 19).toISOString()).toBe('2026-11-11T22:00:00.000Z');
    });
});

describe('scheduleFor', () => {
    const now = new Date('2026-11-10T18:00:00Z');

    it('recordar: una vez, mañana a las 19:00', () => {
        expect(scheduleFor('recordar', now)).toEqual({ nextRunAt: new Date('2026-11-11T22:00:00Z'), runsLeft: 1 });
    });

    it('plan: tres bloques, el primero mañana a las 18:45', () => {
        expect(scheduleFor('plan', now)).toEqual({ nextRunAt: new Date('2026-11-11T21:45:00Z'), runsLeft: 3 });
    });

    it('resumen sale ya; docente espera un evento', () => {
        expect(scheduleFor('resumen', now)).toEqual({ nextRunAt: now, runsLeft: 1 });
        expect(scheduleFor('docente', now)).toEqual({ nextRunAt: null, runsLeft: 0 });
    });

    it('el plan se reprograma cada 48 h mientras queden bloques', () => {
        expect(nextAfterRun('plan', now, 2)).toEqual(new Date('2026-11-12T18:00:00Z'));
        expect(nextAfterRun('plan', now, 0)).toBeNull();
        expect(nextAfterRun('recordar', now, 0)).toBeNull();
    });
});

describe('finishRun', () => {
    const now = new Date('2026-11-11T21:45:00Z');

    it('después del último bloque queda terminada', () => {
        expect(finishRun({ action: 'plan', runsLeft: 1, runsDone: 2, lastSentAt: null }, now, true)).toEqual({
            status: 'done', nextRunAt: null, runsLeft: 0, runsDone: 3, lastSentAt: now,
        });
    });

    it('si falló, reintenta en 15 minutos sin gastar la corrida', () => {
        const result = finishRun({ action: 'recordar', runsLeft: 1, runsDone: 0, lastSentAt: null }, now, false);
        expect(result.status).toBe('active');
        expect(result.runsLeft).toBe(1);
        expect(result.nextRunAt).toEqual(new Date('2026-11-11T22:00:00Z'));
    });
});

describe('summarizeLesson', () => {
    it('usa los títulos de sección cuando hay al menos tres', () => {
        const md = '# Título\n\n## Qué es\ntexto\n\n## Para qué sirve\ntexto\n\n### Ejemplo con `código`\ntexto';
        expect(summarizeLesson(md)).toEqual(['Qué es', 'Para qué sirve', 'Ejemplo con código']);
    });

    it('si no, toma la primera oración de cada párrafo, sin links ni listas', () => {
        const md = 'JavaScript nació en 1995 en Netscape. Después creció.\n\n- un item\n\nHoy corre en [todos los navegadores](https://x.test) y servidores.';
        expect(summarizeLesson(md)).toEqual([
            'JavaScript nació en 1995 en Netscape.',
            'Hoy corre en todos los navegadores y servidores.',
        ]);
    });

    it('sin contenido no inventa nada', () => {
        expect(summarizeLesson(null)).toEqual([]);
        expect(messageFor('resumen', 'Video', { summary: [] }).body).toMatch(/no tiene texto para resumir/);
    });
});

describe('messageFor', () => {
    it('el plan dice qué bloque toca', () => {
        expect(messageFor('plan', 'Variables', { runIndex: 1 }).body).toBe('Practicar con el tutor de «Variables» (20 min).');
    });
});
