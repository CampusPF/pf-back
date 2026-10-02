import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
// Un audio de voz de 60 s pesa ~0,5 MB en Opus (Chrome/Firefox) y ~1 MB en
// AAC (Safari): 5 MB deja margen sin abrir la puerta a archivos enormes.
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PDF_MIME_TYPES = ['application/pdf'];
// Lo que graba MediaRecorder en cada navegador: webm/opus (Chrome, Edge,
// Firefox, Android), mp4/aac (Safari, iOS) y ogg/opus (Firefox viejo). Más
// mp3/wav por si se sube un archivo a mano.
const AUDIO_MIME_TYPES = [
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
];

/** "audio/webm;codecs=opus" → "audio/webm": el navegador manda el codec
    como parámetro del tipo, y lo que se valida es el tipo base. */
function baseMimeType(mimetype: string): string {
    return mimetype.split(';')[0].trim().toLowerCase();
}

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
            if (!allowed.includes(baseMimeType(file.mimetype))) {
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
export const AUDIO_UPLOAD_OPTIONS = buildOptions(AUDIO_MIME_TYPES, MAX_AUDIO_BYTES);

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

const AUDIO_SIGNATURES: Array<(buffer: Buffer) => boolean> = [
    // WebM/Matroska (EBML): 1A 45 DF A3
    (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    // Ogg: "OggS"
    (b) => b.subarray(0, 4).toString('ascii') === 'OggS',
    // MP4/M4A: "ftyp" en el offset 4
    (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
    // WAV: "RIFF" .... "WAVE"
    (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' &&
        b.subarray(8, 12).toString('ascii') === 'WAVE',
    // MP3: con tag "ID3" o directo un frame (11 bits de sync en 1)
    (b) => b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
];

/**
 * Valida que el contenido real del archivo coincida con lo que declara.
 * Se llama SIEMPRE antes de subir nada a Cloudinary: si falla, la request
 * muere con un 400 y no se consumen créditos ni queda basura en el media library.
 */
export function assertMagicBytes(
    file: Express.Multer.File,
    kind: 'image' | 'pdf' | 'audio',
): void {
    if (!file?.buffer?.length) {
        throw new BadRequestException('El archivo está vacío.');
    }

    const valid =
        kind === 'pdf'
            ? isPdf(file.buffer)
            : (kind === 'audio' ? AUDIO_SIGNATURES : IMAGE_SIGNATURES).some((matches) =>
                matches(file.buffer),
            );

    if (!valid) {
        throw new BadRequestException(
            kind === 'pdf'
                ? 'El archivo no es un PDF válido.'
                : kind === 'audio'
                    ? 'El archivo no es un audio válido (WebM, OGG, MP4, MP3 o WAV).'
                    : 'El archivo no es una imagen válida (JPEG, PNG o WEBP).',
        );
    }
}

/** Multer deja `file` en undefined si el campo no vino en el multipart. */
export function assertFilePresent(
    file: Express.Multer.File | undefined,
    field = 'file',
): Express.Multer.File {
    if (!file) {
        throw new BadRequestException(
            `No se recibió ningún archivo. Enviá el campo "${field}" como multipart/form-data.`,
        );
    }
    return file;
}
