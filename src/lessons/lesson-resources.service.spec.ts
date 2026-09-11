import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
    LessonResourcesService,
    DOWNLOAD_TTL_SECONDS,
} from './lesson-resources.service';
import { LessonResource } from './entities/lesson-resource.entity';
import { LessonsService } from './lessons.service';
import { LessonsAccessService } from './lessons-access.service';
import { CloudinaryService } from '../file-upload/cloudinary.service';
import { UserRole } from '../users/entities/user.entity';

/**
 * Unit del control de acceso a los adjuntos. Igual que en
 * lessons-access.service.spec, se instancia a mano con dependencias falsas:
 * @nestjs/testing no se usa en este repo (ver auth.service.spec.ts).
 */

const LESSON_ID = 'lesson-1';
const RESOURCE_ID = 'res-1';

const RESOURCE = {
    id: RESOURCE_ID,
    title: 'Apunte.pdf',
    publicId: 'campus-lite/test/lesson-resources/abc',
    sizeBytes: 1024,
} as LessonResource;

const STUDENT = { id: 'u1', role: UserRole.STUDENT };

function makeService({ hasAccess = true, resource = RESOURCE as LessonResource | null } = {}) {
    const findOneLesson = jest.fn(async () => ({
        id: LESSON_ID,
        module: { course: { id: 'c1', priceInCents: 4999 } },
    }));
    const canAccessCourseContent = jest.fn(async () => hasAccess);
    const getSignedUrl = jest.fn(() => 'https://signed.example/apunte.pdf');
    const destroy = jest.fn(async () => undefined);
    const uploadPrivateFile = jest.fn(async () => ({
        publicId: 'nuevo-pid',
        bytes: 2048,
    }));

    const repo = {
        findOne: jest.fn(async () => resource),
        find: jest.fn(async () => [RESOURCE]),
        create: jest.fn((data: object) => data),
        save: jest.fn(async (data: object) => ({ id: 'nuevo', ...data })),
        remove: jest.fn(async () => undefined),
    };

    const service = new LessonResourcesService(
        repo as unknown as Repository<LessonResource>,
        { findOne: findOneLesson } as unknown as LessonsService,
        { canAccessCourseContent } as unknown as LessonsAccessService,
        { getSignedUrl, destroy, uploadPrivateFile } as unknown as CloudinaryService,
    );

    return {
        service,
        repo,
        findOneLesson,
        canAccessCourseContent,
        getSignedUrl,
        destroy,
        uploadPrivateFile,
    };
}

describe('LessonResourcesService.getDownloadUrl', () => {
    /**
     * Acá sí se responde 403 y no un 200 con datos vacíos como hace
     * GET /lessons/:id: de un archivo no hay nada parcial que mostrar.
     */
    it('sin acceso al curso → 403 y no firma ninguna URL', async () => {
        const { service, getSignedUrl } = makeService({ hasAccess: false });

        await expect(
            service.getDownloadUrl(LESSON_ID, RESOURCE_ID, STUDENT),
        ).rejects.toThrow(ForbiddenException);

        expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('con acceso → devuelve URL firmada con vencimiento de 10 minutos', async () => {
        const { service, getSignedUrl } = makeService({ hasAccess: true });
        const before = Date.now();

        const result = await service.getDownloadUrl(LESSON_ID, RESOURCE_ID, STUDENT);

        expect(getSignedUrl).toHaveBeenCalledWith(
            RESOURCE.publicId,
            DOWNLOAD_TTL_SECONDS,
        );
        expect(result.url).toBe('https://signed.example/apunte.pdf');
        expect(result.title).toBe('Apunte.pdf');
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(
            before + DOWNLOAD_TTL_SECONDS * 1000,
        );
        expect(DOWNLOAD_TTL_SECONDS).toBe(600);
    });

    it('el gate recibe el usuario completo y el curso de la lección', async () => {
        const { service, canAccessCourseContent } = makeService();

        await service.getDownloadUrl(LESSON_ID, RESOURCE_ID, STUDENT);

        expect(canAccessCourseContent).toHaveBeenCalledWith(
            STUDENT,
            expect.objectContaining({ id: 'c1', priceInCents: 4999 }),
        );
    });

    it('recurso inexistente → 404 (después de pasar el gate)', async () => {
        const { service } = makeService({ hasAccess: true, resource: null });

        await expect(
            service.getDownloadUrl(LESSON_ID, RESOURCE_ID, STUDENT),
        ).rejects.toThrow(NotFoundException);
    });

    /** Un recurso de otra lección no debe ser accesible vía esta ruta. */
    it('busca el recurso acotado a ESA lección', async () => {
        const { service, repo } = makeService();

        await service.getDownloadUrl(LESSON_ID, RESOURCE_ID, STUDENT);

        expect(repo.findOne).toHaveBeenCalledWith({
            where: { id: RESOURCE_ID, lesson: { id: LESSON_ID } },
        });
    });
});

describe('LessonResourcesService.findAllByLesson', () => {
    it('no expone el publicId convertido en URL: sólo metadatos', async () => {
        const { service, getSignedUrl } = makeService();

        const list = await service.findAllByLesson(LESSON_ID);

        expect(list).toHaveLength(1);
        expect(getSignedUrl).not.toHaveBeenCalled();
    });
});

describe('LessonResourcesService.create', () => {
    it('valida que sea un PDF real antes de subir', async () => {
        const { service, uploadPrivateFile } = makeService();
        const noEsPdf = {
            buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
            originalname: 'trampa.pdf',
            mimetype: 'application/pdf',
        } as Express.Multer.File;

        await expect(service.create(LESSON_ID, noEsPdf)).rejects.toThrow();
        expect(uploadPrivateFile).not.toHaveBeenCalled();
    });

    it('usa el nombre del archivo como título cuando no se manda uno', async () => {
        const { service, repo } = makeService();
        const pdf = {
            buffer: Buffer.from('%PDF-1.7'),
            originalname: 'clase-3.pdf',
            mimetype: 'application/pdf',
        } as Express.Multer.File;

        await service.create(LESSON_ID, pdf);

        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'clase-3.pdf',
                publicId: 'nuevo-pid',
                sizeBytes: 2048,
            }),
        );
    });

    it('lección inexistente → 404 sin subir nada', async () => {
        const { service, findOneLesson, uploadPrivateFile } = makeService();
        findOneLesson.mockRejectedValueOnce(new NotFoundException());

        const pdf = {
            buffer: Buffer.from('%PDF-1.7'),
            originalname: 'x.pdf',
            mimetype: 'application/pdf',
        } as Express.Multer.File;

        await expect(service.create(LESSON_ID, pdf)).rejects.toThrow(NotFoundException);
        expect(uploadPrivateFile).not.toHaveBeenCalled();
    });
});

describe('LessonResourcesService.remove', () => {
    it('borra primero en Cloudinary y después la fila', async () => {
        const { service, destroy, repo } = makeService();

        await service.remove(LESSON_ID, RESOURCE_ID);

        expect(destroy).toHaveBeenCalledWith(
            RESOURCE.publicId,
            'raw',
            'authenticated',
        );
        expect(repo.remove).toHaveBeenCalledWith(RESOURCE);
    });

    it('recurso inexistente → 404', async () => {
        const { service } = makeService({ resource: null });
        await expect(service.remove(LESSON_ID, RESOURCE_ID)).rejects.toThrow(
            NotFoundException,
        );
    });
});
