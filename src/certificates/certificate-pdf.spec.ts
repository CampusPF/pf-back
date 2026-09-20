import { certificateSubtitle } from './certificate-pdf';

describe('certificateSubtitle', () => {
    it('con horas → "N horas de contenido · Emitido el …"', () => {
        expect(certificateSubtitle(12, '19 de septiembre de 2026')).toBe(
            '12 horas de contenido · Emitido el 19 de septiembre de 2026',
        );
    });

    it('1 hora va en singular', () => {
        expect(certificateSubtitle(1, '19 de septiembre de 2026')).toBe(
            '1 hora de contenido · Emitido el 19 de septiembre de 2026',
        );
    });

    it('curso sin duración cargada (0) → no dice "0 horas", sólo la fecha', () => {
        expect(certificateSubtitle(0, '19 de septiembre de 2026')).toBe(
            'Emitido el 19 de septiembre de 2026',
        );
    });
});
