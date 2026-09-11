import { BadRequestException } from '@nestjs/common';
import {
    IMAGE_UPLOAD_OPTIONS,
    PDF_UPLOAD_OPTIONS,
    MAX_IMAGE_BYTES,
    MAX_PDF_BYTES,
    assertMagicBytes,
    assertFilePresent,
} from './file-validation';

/** Arma el mínimo de Express.Multer.File que usan los validadores. */
function fakeFile(
    mimetype: string,
    buffer: Buffer,
): Express.Multer.File {
    return { mimetype, buffer, originalname: 'x' } as Express.Multer.File;
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP', 'ascii'),
]);
const PDF = Buffer.from('%PDF-1.7\n...', 'ascii');
const GIF = Buffer.from('GIF89a', 'ascii');

describe('assertMagicBytes', () => {
    it.each([
        ['JPEG', JPEG],
        ['PNG', PNG],
        ['WEBP', WEBP],
    ])('acepta %s válido', (_label, buffer) => {
        expect(() => assertMagicBytes(fakeFile('image/png', buffer), 'image')).not.toThrow();
    });

    it('acepta un PDF válido', () => {
        expect(() =>
            assertMagicBytes(fakeFile('application/pdf', PDF), 'pdf'),
        ).not.toThrow();
    });

    /**
     * El caso que justifica todo este chequeo: el mimetype lo declara el
     * cliente en el multipart, así que pasa el fileFilter sin problema. Sólo
     * mirar el contenido real lo detecta.
     */
    it('rechaza un PDF disfrazado de image/png', () => {
        expect(() => assertMagicBytes(fakeFile('image/png', PDF), 'image')).toThrow(
            BadRequestException,
        );
    });

    it('rechaza una imagen disfrazada de application/pdf', () => {
        expect(() => assertMagicBytes(fakeFile('application/pdf', PNG), 'pdf')).toThrow(
            BadRequestException,
        );
    });

    it('rechaza un formato de imagen no soportado (GIF)', () => {
        expect(() => assertMagicBytes(fakeFile('image/png', GIF), 'image')).toThrow(
            BadRequestException,
        );
    });

    it('rechaza un archivo vacío', () => {
        expect(() =>
            assertMagicBytes(fakeFile('image/png', Buffer.alloc(0)), 'image'),
        ).toThrow(BadRequestException);
    });
});

describe('assertFilePresent', () => {
    it('lanza 400 si multer no recibió el campo "file"', () => {
        expect(() => assertFilePresent(undefined)).toThrow(BadRequestException);
    });

    it('devuelve el archivo cuando vino', () => {
        const file = fakeFile('image/png', PNG);
        expect(assertFilePresent(file)).toBe(file);
    });
});

describe('opciones de multer', () => {
    /** Invoca el fileFilter y devuelve el error que le pasó al callback. */
    function runFilter(
        options: typeof IMAGE_UPLOAD_OPTIONS,
        mimetype: string,
    ): Error | null {
        let received: Error | null = null;
        options.fileFilter!(
            {} as never,
            fakeFile(mimetype, Buffer.alloc(0)),
            (error: Error | null) => {
                received = error;
            },
        );
        return received;
    }

    it('imágenes: acepta jpeg/png/webp y rechaza el resto', () => {
        expect(runFilter(IMAGE_UPLOAD_OPTIONS, 'image/jpeg')).toBeNull();
        expect(runFilter(IMAGE_UPLOAD_OPTIONS, 'image/png')).toBeNull();
        expect(runFilter(IMAGE_UPLOAD_OPTIONS, 'image/webp')).toBeNull();
        expect(runFilter(IMAGE_UPLOAD_OPTIONS, 'image/gif')).toBeInstanceOf(
            BadRequestException,
        );
        expect(runFilter(IMAGE_UPLOAD_OPTIONS, 'application/pdf')).toBeInstanceOf(
            BadRequestException,
        );
    });

    it('PDFs: sólo application/pdf', () => {
        expect(runFilter(PDF_UPLOAD_OPTIONS, 'application/pdf')).toBeNull();
        expect(runFilter(PDF_UPLOAD_OPTIONS, 'image/png')).toBeInstanceOf(
            BadRequestException,
        );
    });

    it('los límites de tamaño son los documentados (5MB / 20MB) y un archivo por request', () => {
        expect(IMAGE_UPLOAD_OPTIONS.limits).toEqual({
            fileSize: MAX_IMAGE_BYTES,
            files: 1,
        });
        expect(PDF_UPLOAD_OPTIONS.limits).toEqual({
            fileSize: MAX_PDF_BYTES,
            files: 1,
        });
        expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
        expect(MAX_PDF_BYTES).toBe(20 * 1024 * 1024);
    });
});
