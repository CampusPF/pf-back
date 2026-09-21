import { certificateSubtitle, formatCourseDuration } from './certificate-pdf';

const DATE = '19 de septiembre de 2026';

describe('formatCourseDuration', () => {
    it('menos de una hora → sólo minutos', () => {
        expect(formatCourseDuration(45)).toBe('45 min');
    });

    it('horas exactas → sin los minutos en cero', () => {
        expect(formatCourseDuration(120)).toBe('2 hs');
        expect(formatCourseDuration(60)).toBe('1 h');
    });

    it('horas y minutos → "N hs y M min"', () => {
        expect(formatCourseDuration(154)).toBe('2 hs y 34 min');
    });

    it('una sola hora va en singular, para no escribir "1 hs"', () => {
        expect(formatCourseDuration(94)).toBe('1 h y 34 min');
    });

    /* La razón de ser de este formateador: con `Math.ceil(min / 60)` estos dos
       cursos decían los dos "2 horas" y no había forma de distinguirlos. */
    it('dos cursos de duración distinta no se leen igual', () => {
        expect(formatCourseDuration(83)).not.toBe(formatCourseDuration(115));
        expect(formatCourseDuration(83)).toBe('1 h y 23 min');
        expect(formatCourseDuration(115)).toBe('1 h y 55 min');
    });

    it('no rompe con valores raros', () => {
        expect(formatCourseDuration(0)).toBe('0 min');
        expect(formatCourseDuration(-10)).toBe('0 min');
    });
});

describe('certificateSubtitle', () => {
    it('con duración → "… de contenido · Emitido el …"', () => {
        expect(certificateSubtitle(154, DATE)).toBe(
            `2 hs y 34 min de contenido · Emitido el ${DATE}`,
        );
    });

    it('una hora justa va en singular', () => {
        expect(certificateSubtitle(60, DATE)).toBe(`1 h de contenido · Emitido el ${DATE}`);
    });

    it('curso sin duración cargada (0) → no dice "0 min", sólo la fecha', () => {
        expect(certificateSubtitle(0, DATE)).toBe(`Emitido el ${DATE}`);
    });
});
