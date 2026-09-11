import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Writable } from 'stream';

/**
 * El SDK se mockea entero: acá se prueban las OPCIONES con las que se lo
 * llama (carpeta, resource_type, type authenticated, vencimiento), no que
 * Cloudinary funcione.
 *
 * `upload_stream` devuelve un objeto con `.end()` porque el service le pipea
 * un stream; con que sea un Writable alcanza. El callback se dispara en el
 * momento para resolver la promesa.
 */
// Los parámetros se declaran como rest `unknown[]` para que el wrapper del
// jest.mock pueda reenviarles `...args` y para que `.mock.calls` quede tipado.
const uploadStream = jest.fn();
const destroy = jest.fn(async (..._args: unknown[]) => ({ result: 'ok' }));
const privateDownloadUrl = jest.fn(
    (..._args: unknown[]) => 'https://signed.example/file.pdf',
);
const configure = jest.fn();

jest.mock('cloudinary', () => ({
    v2: {
        config: (...args: unknown[]) => configure(...args),
        uploader: {
            upload_stream: (...args: unknown[]) => uploadStream(...args),
            destroy: (...args: unknown[]) => destroy(...args),
        },
        utils: {
            private_download_url: (...args: unknown[]) => privateDownloadUrl(...args),
        },
    },
}));

// Se importa DESPUÉS del jest.mock para que tome el módulo mockeado.
import { CloudinaryService } from './cloudinary.service';

/** Writable que acepta todo y no hace nada: el destino del pipe del service. */
function nullSink(): Writable {
    return new Writable({ write: (_chunk, _encoding, done) => done() });
}

/** Simula una subida exitosa devolviendo `response` al callback. */
function mockUploadResult(response: Record<string, unknown>) {
    uploadStream.mockImplementation((_options, callback) => {
        const sink = nullSink();
        sink.on('finish', () => callback(null, response));
        return sink;
    });
}

/** ConfigService falso: devuelve lo que le pasemos por clave. */
function fakeConfig(values: Record<string, string | undefined>): ConfigService {
    return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const FULL_CONFIG = {
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
    NODE_ENV: 'test',
};

function fakeFile(): Express.Multer.File {
    return {
        buffer: Buffer.from('%PDF-1.7 contenido'),
        originalname: 'apunte.pdf',
        mimetype: 'application/pdf',
    } as Express.Multer.File;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CloudinaryService sin credenciales', () => {
    /**
     * Mismo criterio que StripeService: la app levanta igual (un dev puede
     * trabajar sin cuenta de Cloudinary), pero subir responde 503 y no un 500
     * críptico del SDK.
     */
    it('no configura el SDK y responde 503 en cada operación', async () => {
        const service = new CloudinaryService(fakeConfig({ NODE_ENV: 'test' }));

        expect(configure).not.toHaveBeenCalled();

        await expect(service.uploadImage(fakeFile(), 'courses')).rejects.toThrow(
            ServiceUnavailableException,
        );
        await expect(
            service.uploadPrivateFile(fakeFile(), 'lesson-resources'),
        ).rejects.toThrow(ServiceUnavailableException);
        expect(() => service.getSignedUrl('pid', 600)).toThrow(
            ServiceUnavailableException,
        );
    });

    it('basta con que falte UNA de las tres variables', async () => {
        const service = new CloudinaryService(
            fakeConfig({ ...FULL_CONFIG, CLOUDINARY_API_SECRET: undefined }),
        );
        await expect(service.uploadImage(fakeFile(), 'courses')).rejects.toThrow(
            ServiceUnavailableException,
        );
    });
});

describe('CloudinaryService configurado', () => {
    let service: CloudinaryService;

    beforeEach(() => {
        service = new CloudinaryService(fakeConfig(FULL_CONFIG));
    });

    it('configura el SDK una sola vez, con secure:true', () => {
        expect(configure).toHaveBeenCalledWith(
            expect.objectContaining({
                cloud_name: 'demo',
                api_key: 'key',
                api_secret: 'secret',
                secure: true,
            }),
        );
    });

    it('uploadImage sube a la carpeta del entorno, como image y con transformación', async () => {
        mockUploadResult({
            public_id: 'campus-lite/test/courses/abc',
            secure_url: 'https://res.cloudinary.com/demo/abc.jpg',
        });

        const result = await service.uploadImage(fakeFile(), 'courses');

        const [options] = uploadStream.mock.calls[0];
        // El entorno va en la ruta: subir desde dev no ensucia producción.
        expect(options.folder).toBe('campus-lite/test/courses');
        expect(options.resource_type).toBe('image');
        expect(options.transformation).toEqual([
            { width: 1600, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' },
        ]);

        expect(result).toEqual({
            publicId: 'campus-lite/test/courses/abc',
            url: 'https://res.cloudinary.com/demo/abc.jpg',
        });
    });

    /**
     * Lo que hace privado al archivo: sin type:'authenticated' la URL pública
     * serviría el PDF a cualquiera que la adivine, y el gate de acceso sería
     * decorativo.
     */
    it('uploadPrivateFile sube como raw + authenticated', async () => {
        mockUploadResult({ public_id: 'campus-lite/test/lesson-resources/p', bytes: 2048 });

        const result = await service.uploadPrivateFile(fakeFile(), 'lesson-resources');

        const [options] = uploadStream.mock.calls[0];
        expect(options.resource_type).toBe('raw');
        expect(options.type).toBe('authenticated');
        expect(options.folder).toBe('campus-lite/test/lesson-resources');

        expect(result).toEqual({
            publicId: 'campus-lite/test/lesson-resources/p',
            bytes: 2048,
        });
    });

    it('getSignedUrl firma con vencimiento futuro sobre raw/authenticated', () => {
        const before = Math.floor(Date.now() / 1000);
        service.getSignedUrl('pid', 600);

        const [publicId, , options] = privateDownloadUrl.mock.calls[0] as [
            string,
            string,
            { resource_type: string; type: string; expires_at: number },
        ];

        expect(publicId).toBe('pid');
        expect(options.resource_type).toBe('raw');
        expect(options.type).toBe('authenticated');
        expect(options.expires_at).toBeGreaterThanOrEqual(before + 600);
        expect(options.expires_at).toBeLessThanOrEqual(before + 601);
    });

    it('replaceImage sube la nueva ANTES de borrar la vieja', async () => {
        const order: string[] = [];
        uploadStream.mockImplementation((_options, callback) => {
            const sink = nullSink();
            sink.on('finish', () => {
                order.push('upload');
                callback(null, { public_id: 'nuevo', secure_url: 'https://res/nuevo.jpg' });
            });
            return sink;
        });
        destroy.mockImplementation(async () => {
            order.push('destroy');
            return { result: 'ok' };
        });

        const file = { ...fakeFile(), buffer: Buffer.from([0xff, 0xd8, 0xff]) } as Express.Multer.File;
        await service.replaceImage(file, 'courses', 'viejo');

        expect(order).toEqual(['upload', 'destroy']);
        expect(destroy).toHaveBeenCalledWith(
            'viejo',
            expect.objectContaining({ resource_type: 'image', invalidate: true }),
        );
    });

    it('replaceImage no borra nada si la imagen anterior era externa (sin publicId)', async () => {
        mockUploadResult({ public_id: 'nuevo', secure_url: 'https://res/nuevo.jpg' });

        const file = { ...fakeFile(), buffer: Buffer.from([0xff, 0xd8, 0xff]) } as Express.Multer.File;
        await service.replaceImage(file, 'courses', null);

        expect(destroy).not.toHaveBeenCalled();
    });

    it('replaceImage valida el contenido ANTES de subir', async () => {
        mockUploadResult({ public_id: 'x', secure_url: 'https://res/x.jpg' });

        // Buffer de PDF con destino "imagen".
        await expect(
            service.replaceImage(fakeFile(), 'courses', null),
        ).rejects.toThrow();

        // Lo importante: no se gastó una subida ni quedó basura en Cloudinary.
        expect(uploadStream).not.toHaveBeenCalled();
    });

    /**
     * destroy se usa para limpiar la imagen vieja tras un reemplazo exitoso.
     * Si ese borrado falla (el archivo ya no está, corte de red), la subida
     * que ya funcionó no debe convertirse en un 500.
     */
    it('destroy no propaga el error si Cloudinary falla', async () => {
        destroy.mockRejectedValueOnce(new Error('not found'));
        await expect(service.destroy('pid')).resolves.toBeUndefined();
    });
});
