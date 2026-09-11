import {
    Injectable,
    InternalServerErrorException,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiOptions, UploadApiResponse, v2 } from 'cloudinary';
import { assertMagicBytes } from './file-validation';
import toStream = require('buffer-to-stream');

/** Lo que se persiste de un archivo público: la URL para mostrar y el id para borrarlo. */
export interface UploadedImage {
    publicId: string;
    url: string;
}

/** De un archivo privado NO se guarda URL: se firma al pedirla y vence. */
export interface UploadedPrivateFile {
    publicId: string;
    bytes: number;
}

/**
 * Único punto donde se configura el SDK de Cloudinary y se sube contenido.
 * Mismo criterio que StripeService: la credencial se lee por ConfigService una
 * sola vez al arrancar, y si falta la app igual levanta pero cualquier endpoint
 * de subida responde 503 en vez de fallar con un error críptico del SDK.
 *
 * El api_secret vive SOLO acá. El front nunca sube directo a Cloudinary.
 */
@Injectable()
export class CloudinaryService {
    private readonly logger = new Logger(CloudinaryService.name);
    private readonly configured: boolean;

    /**
     * Raíz de todas las carpetas, con el entorno adentro: subir desde
     * desarrollo no ensucia el media library de producción.
     */
    private readonly rootFolder: string;

    constructor(config: ConfigService) {
        const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
        const apiKey = config.get<string>('CLOUDINARY_API_KEY');
        const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');

        this.rootFolder = `campus-lite/${config.get<string>('NODE_ENV') ?? 'development'}`;

        if (!cloudName || !apiKey || !apiSecret) {
            this.logger.warn(
                'Cloudinary no configurado: los endpoints de subida responderán 503.',
            );
            this.configured = false;
            return;
        }

        v2.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            // Fuerza https en las URLs que devuelve el SDK.
            secure: true,
        });
        this.configured = true;
    }

    /**
     * Sube una imagen pública (portadas, avatares, categorías).
     *
     * La transformación se aplica AL SUBIR, no al servir: la original pesada se
     * descarta y en Cloudinary queda una sola copia ya normalizada. `crop:
     * 'limit'` sólo achica las que superan 1600px de ancho, nunca agranda.
     */
    async uploadImage(
        file: Express.Multer.File,
        folder: string,
    ): Promise<UploadedImage> {
        const result = await this.upload(file, {
            folder: this.folderPath(folder),
            resource_type: 'image',
            transformation: [
                { width: 1600, crop: 'limit' },
                { quality: 'auto', fetch_format: 'auto' },
            ],
        });

        return { publicId: result.public_id, url: result.secure_url };
    }

    /**
     * Sube una imagen y borra la anterior, si había una nuestra.
     *
     * El orden importa: primero sube la nueva, y sólo si eso salió bien borra
     * la vieja. Al revés, un fallo en la subida dejaría a la entidad sin imagen.
     * El borrado es best-effort (`destroy` no lanza), así que un archivo
     * huérfano nunca hace fallar una subida que ya funcionó.
     *
     * `previousPublicId` viene null cuando la imagen actual es una URL externa
     * (seeds, terceros): ahí no hay nada que borrar.
     */
    async replaceImage(
        file: Express.Multer.File,
        folder: string,
        previousPublicId?: string | null,
    ): Promise<UploadedImage> {
        assertMagicBytes(file, 'image');

        const uploaded = await this.uploadImage(file, folder);

        if (previousPublicId && previousPublicId !== uploaded.publicId) {
            await this.destroy(previousPublicId, 'image');
        }

        return uploaded;
    }

    /**
     * Sube un archivo privado (PDFs adjuntos de lección).
     *
     * `type: 'authenticated'` es lo que hace que la URL pública NO sirva el
     * archivo: sólo se puede acceder con una URL firmada. `resource_type: 'raw'`
     * porque un PDF no es una imagen que Cloudinary deba transformar.
     */
    async uploadPrivateFile(
        file: Express.Multer.File,
        folder: string,
    ): Promise<UploadedPrivateFile> {
        const result = await this.upload(file, {
            folder: this.folderPath(folder),
            resource_type: 'raw',
            type: 'authenticated',
        });

        return { publicId: result.public_id, bytes: result.bytes };
    }

    /**
     * URL firmada y con vencimiento para un archivo `authenticated`.
     *
     * Se genera en el momento de pedirla y se entrega sólo a quien pasó el
     * control de acceso: no se guarda en la base ni se cachea.
     */
    getSignedUrl(publicId: string, ttlSeconds: number): string {
        this.assertConfigured();

        return v2.utils.private_download_url(publicId, '', {
            resource_type: 'raw',
            type: 'authenticated',
            expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
        });
    }

    /**
     * Borra un archivo. No lanza si ya no existe: se usa para limpiar la imagen
     * vieja al reemplazarla, y que ese borrado falle no debe tumbar una subida
     * que ya salió bien.
     */
    async destroy(
        publicId: string,
        resourceType: 'image' | 'raw' = 'image',
        type: 'upload' | 'authenticated' = 'upload',
    ): Promise<void> {
        this.assertConfigured();

        try {
            await v2.uploader.destroy(publicId, {
                resource_type: resourceType,
                type,
                // Sin esto, una copia cacheada en el CDN sigue respondiendo.
                invalidate: true,
            });
        } catch (error) {
            this.logger.warn(
                `No se pudo borrar ${publicId} en Cloudinary: ${(error as Error).message}`,
            );
        }
    }

    /**
     * `upload_stream` no acepta un Buffer directo, hay que pipearle un stream.
     * El archivo viene de memoria (Multer usa memoryStorage por defecto), así
     * que nunca toca el disco del servidor.
     */
    private upload(
        file: Express.Multer.File,
        options: UploadApiOptions,
    ): Promise<UploadApiResponse> {
        this.assertConfigured();

        return new Promise((resolve, reject) => {
            const stream = v2.uploader.upload_stream(options, (error, result) => {
                if (error || !result) {
                    this.logger.error(
                        `Falló la subida a Cloudinary: ${error?.message ?? 'sin resultado'}`,
                    );
                    reject(
                        new InternalServerErrorException(
                            'No se pudo subir el archivo. Intentá de nuevo.',
                        ),
                    );
                    return;
                }
                resolve(result);
            });

            toStream(file.buffer).pipe(stream);
        });
    }

    private folderPath(folder: string): string {
        return `${this.rootFolder}/${folder}`;
    }

    private assertConfigured(): void {
        if (!this.configured) {
            throw new ServiceUnavailableException(
                'Almacenamiento de archivos no configurado (faltan las variables CLOUDINARY_*).',
            );
        }
    }
}

/** Carpetas de Cloudinary, bajo `campus-lite/{NODE_ENV}/`. */
export const UPLOAD_FOLDERS = {
    COURSES: 'courses',
    CATEGORIES: 'categories',
    AVATARS: 'avatars',
    LESSON_RESOURCES: 'lesson-resources',
} as const;
