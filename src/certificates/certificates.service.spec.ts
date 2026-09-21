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
