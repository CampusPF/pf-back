import { BadRequestException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

/**
 * El certificado exige el 100% de lecciones Y todos los checkpoints
 * aprobados. Si falta algo, no se genera PDF, no se sube nada a Cloudinary y
 * no se guarda ninguna fila.
 */

const USER_ID = 'student-1';
const COURSE_ID = 'course-1';

function makeService({ progressPercent = 100, quizzesOk = true } = {}) {
    const certificateRepository = {
        findOne: jest.fn(async () => null),
        exists: jest.fn(async () => false),
        create: jest.fn((data) => data),
        save: jest.fn(async (data) => data),
    };
    const enrollmentsRepository = {
        findOne: jest.fn(async () => ({
            progressPercent,
            student: { name: 'María' },
            course: { title: 'NestJS' },
        })),
    };
    const cloudinary = { uploadPublicPdf: jest.fn() };
    const eventEmitter = { emit: jest.fn() };
    const quizzesService = { hasPassedAllQuizzes: jest.fn(async () => quizzesOk) };

    const service = new CertificatesService(
        certificateRepository as never,
        enrollmentsRepository as never,
        {} as never, // lessons
        {} as never, // notifications
        cloudinary as never,
        { get: jest.fn() } as never,
        eventEmitter as never,
        quizzesService as never,
    );

    return { service, certificateRepository, cloudinary, eventEmitter, quizzesService };
}

describe('CertificatesService.issue — checkpoints', () => {
    it('100% de lecciones pero falta aprobar un checkpoint → 400 con mensaje claro, sin emitir nada', async () => {
        const { service, certificateRepository, cloudinary, eventEmitter, quizzesService } =
            makeService({ quizzesOk: false });

        const issuing = service.issue(USER_ID, COURSE_ID);

        await expect(issuing).rejects.toBeInstanceOf(BadRequestException);
        await expect(issuing).rejects.toThrow(/Te falta aprobar un checkpoint/);
        expect(quizzesService.hasPassedAllQuizzes).toHaveBeenCalledWith(USER_ID, COURSE_ID);
        expect(cloudinary.uploadPublicPdf).not.toHaveBeenCalled();
        expect(certificateRepository.save).not.toHaveBeenCalled();
        expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('lecciones incompletas → 400 por progreso, antes de mirar los checkpoints', async () => {
        const { service, quizzesService } = makeService({ progressPercent: 80 });

        await expect(service.issue(USER_ID, COURSE_ID)).rejects.toThrow(/vas por el 80%/);
        expect(quizzesService.hasPassedAllQuizzes).not.toHaveBeenCalled();
    });
});

describe('CertificatesService.issue — nombre del curso', () => {
    it('guarda el título impreso en el PDF, para detectar un renombre después', async () => {
        const { service, certificateRepository, cloudinary } = makeService();
        cloudinary.uploadPublicPdf.mockResolvedValue({ publicId: 'x', url: 'https://res/x.pdf' });
        (service as unknown as { courseMinutes: () => Promise<number> }).courseMinutes =
            async () => 60;
        (service as unknown as { notifyIssued: () => Promise<void> }).notifyIssued =
            async () => undefined;

        await service.issue(USER_ID, COURSE_ID);

        expect(certificateRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ courseTitle: 'NestJS', pdfUrl: 'https://res/x.pdf' }),
        );
    });
});

/**
 * El PDF lleva impreso el nombre del curso. Si el curso se renombra, el
 * certificado se regenera con el nombre nuevo, conservando código y fecha de
 * emisión, y se sube encima del mismo archivo de Cloudinary.
 */
describe('CertificatesService — regeneración al renombrar el curso', () => {
    const ISSUED_AT = new Date('2026-03-10T15:00:00Z');
    const CURRENT_URL =
        'https://res.cloudinary.com/demo/raw/upload/v1/campus-lite/test/certificates/CMP-ABC123.pdf';
    const NEW_URL =
        'https://res.cloudinary.com/demo/raw/upload/v2/campus-lite/test/certificates/CMP-ABC123.pdf';

    function makeCertificate(overrides: Record<string, unknown> = {}) {
        return {
            id: 'cert-1',
            userId: USER_ID,
            courseId: COURSE_ID,
            code: 'CMP-ABC123',
            pdfUrl: CURRENT_URL,
            courseTitle: 'NestJS',
            issuedAt: ISSUED_AT,
            user: { name: 'María' },
            course: { title: 'NestJS' },
            ...overrides,
        };
    }

    function makeRegenService(certificates: ReturnType<typeof makeCertificate>[]) {
        const certificateRepository = {
            find: jest.fn(async () => certificates),
            findOneOrFail: jest.fn(),
            update: jest.fn(async () => undefined),
        };
        const lessonsRepository = {
            createQueryBuilder: jest.fn(() => {
                const qb = {
                    innerJoin: () => qb,
                    where: () => qb,
                    andWhere: () => qb,
                    select: () => qb,
                    getRawOne: async () => ({ total: '90' }),
                };
                return qb;
            }),
        };
        const cloudinary = {
            uploadPublicPdf: jest.fn(async () => ({ publicId: 'x', url: NEW_URL })),
            destroy: jest.fn(async () => undefined),
        };

        const service = new CertificatesService(
            certificateRepository as never,
            {} as never, // enrollments
            lessonsRepository as never,
            {} as never, // notifications
            cloudinary as never,
            { get: jest.fn() } as never,
            { emit: jest.fn() } as never,
            {} as never, // quizzes
        );

        return { service, certificateRepository, cloudinary };
    }

    it('curso renombrado → regenera, sube con el mismo código y guarda la URL nueva', async () => {
        const certificate = makeCertificate({ course: { title: 'NestJS Avanzado' } });
        const { service, certificateRepository, cloudinary } = makeRegenService([certificate]);

        const result = await service.ensureUpToDate(certificate as never);

        expect(cloudinary.uploadPublicPdf).toHaveBeenCalledWith(
            expect.any(Buffer),
            'certificates',
            'CMP-ABC123',
        );
        expect(certificateRepository.update).toHaveBeenCalledWith('cert-1', {
            pdfUrl: NEW_URL,
            courseTitle: 'NestJS Avanzado',
        });
        expect(result.pdfUrl).toBe(NEW_URL);
        expect(result.courseTitle).toBe('NestJS Avanzado');
        // Conserva la fecha de emisión original.
        expect(result.issuedAt).toBe(ISSUED_AT);
        // Mismo public_id (.pdf): no hay archivo viejo que borrar.
        expect(cloudinary.destroy).not.toHaveBeenCalled();
    });

    it('al día → no genera ni sube nada', async () => {
        const certificate = makeCertificate();
        const { service, certificateRepository, cloudinary } = makeRegenService([certificate]);

        const result = await service.ensureUpToDate(certificate as never);

        expect(result).toBe(certificate);
        expect(cloudinary.uploadPublicPdf).not.toHaveBeenCalled();
        expect(certificateRepository.update).not.toHaveBeenCalled();
    });

    it('certificado viejo sin ".pdf" en la URL → se regenera y se borra el archivo anterior', async () => {
        const certificate = makeCertificate({
            courseTitle: null,
            pdfUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/campus-lite/test/certificates/CMP-ABC123',
        });
        const { service, cloudinary } = makeRegenService([certificate]);

        const result = await service.ensureUpToDate(certificate as never);

        expect(result.pdfUrl).toBe(NEW_URL);
        expect(cloudinary.destroy).toHaveBeenCalledWith(
            'campus-lite/test/certificates/CMP-ABC123',
            'raw',
        );
    });

    it('si Cloudinary falla → devuelve el certificado como estaba (su URL sigue sirviendo)', async () => {
        const certificate = makeCertificate({ course: { title: 'NestJS Avanzado' } });
        const { service, certificateRepository, cloudinary } = makeRegenService([certificate]);
        cloudinary.uploadPublicPdf.mockRejectedValueOnce(new Error('503'));

        const result = await service.ensureUpToDate(certificate as never);

        expect(result).toBe(certificate);
        expect(certificateRepository.update).not.toHaveBeenCalled();
    });

    it('findMine devuelve la URL del PDF ya regenerado', async () => {
        const stale = makeCertificate({ course: { title: 'NestJS Avanzado' } });
        const { service } = makeRegenService([stale]);

        const [mine] = await service.findMine(USER_ID);

        expect(mine.pdfUrl).toBe(NEW_URL);
        expect(mine.courseTitle).toBe('NestJS Avanzado');
    });
});
