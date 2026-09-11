import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PDF_MIME_TYPES = ['application/pdf'];

/**
 * fileFilter rechaza por mimetype ANTES de leer el archivo entero, y
 * limits.fileSize corta la request cuando se pasa del tope. Los dos son
 * filtros baratos, pero ninguno mira el contenido real: para eso está
 * `assertMagicBytes`, que corre después en el controller.
 */
function buildOptions(allowed: string[], maxBytes: number): MulterOptions {
    return {
        limits: { fileSize: maxBytes, files: 1 },
        fileFilter: (_req, file, callback) => {
            if (!allowed.includes(file.mimetype)) {
                callback(
                    new BadRequestException(
                        `Tipo de archivo no permitido. Se aceptan: ${allowed.join(', ')}.`,
                    ),
                    false,
                );
                return;
            }
            callback(null, true);
        },
    };
}

export const IMAGE_UPLOAD_OPTIONS = buildOptions(IMAGE_MIME_TYPES, MAX_IMAGE_BYTES);
export const PDF_UPLOAD_OPTIONS = buildOptions(PDF_MIME_TYPES, MAX_PDF_BYTES);

/**
 * Firmas de los primeros bytes de cada formato. Un mimetype se puede falsear
 * (lo manda el cliente en el multipart), el encabezado del archivo no: sin
 * este chequeo se podría subir un ejecutable declarado como image/png.
 */
const IMAGE_SIGNATURES: Array<(buffer: Buffer) => boolean> = [
    // JPEG: FF D8 FF
    (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    // WEBP: "RIFF" .... "WEBP"
    (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' &&
        b.subarray(8, 12).toString('ascii') === 'WEBP',
];

// PDF: "%PDF"
const isPdf = (b: Buffer): boolean => b.subarray(0, 4).toString('ascii') === '%PDF';

/**
 * Valida que el contenido real del archivo coincida con lo que declara.
 * Se llama SIEMPRE antes de subir nada a Cloudinary: si falla, la request
 * muere con un 400 y no se consumen créditos ni queda basura en el media library.
 */
export function assertMagicBytes(
    file: Express.Multer.File,
    kind: 'image' | 'pdf',
): void {
    if (!file?.buffer?.length) {
        throw new BadRequestException('El archivo está vacío.');
    }

    const valid =
        kind === 'pdf'
            ? isPdf(file.buffer)
            : IMAGE_SIGNATURES.some((matches) => matches(file.buffer));

    if (!valid) {
        throw new BadRequestException(
            kind === 'pdf'
                ? 'El archivo no es un PDF válido.'
                : 'El archivo no es una imagen válida (JPEG, PNG o WEBP).',
        );
    }
}

/** Multer deja `file` en undefined si el campo no vino en el multipart. */
export function assertFilePresent(
    file: Express.Multer.File | undefined,
): Express.Multer.File {
    if (!file) {
        throw new BadRequestException(
            'No se recibió ningún archivo. Enviá el campo "file" como multipart/form-data.',
        );
    }
    return file;
}
