import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonResource } from './entities/lesson-resource.entity';
import { LessonsService } from './lessons.service';
import { AccessActor, LessonsAccessService } from './lessons-access.service';
import {
    CloudinaryService,
    UPLOAD_FOLDERS,
} from '../file-upload/cloudinary.service';
import { assertMagicBytes } from '../file-upload/file-validation';

/**
 * Vencimiento de la URL firmada. Corto a propósito: alcanza para que el
 * navegador arranque la descarga, pero si la URL se filtra (historial, un
 * mensaje reenviado) deja de servir enseguida.
 */
export const DOWNLOAD_TTL_SECONDS = 10 * 60;

@Injectable()
export class LessonResourcesService {
    constructor(
        @InjectRepository(LessonResource)
        private readonly resourcesRepository: Repository<LessonResource>,
        private readonly lessonsService: LessonsService,
        private readonly lessonsAccess: LessonsAccessService,
        private readonly cloudinary: CloudinaryService,
    ) { }

    /** Metadatos solamente: el listado nunca incluye una URL descargable. */
    async findAllByLesson(lessonId: string): Promise<LessonResource[]> {
        await this.lessonsService.findOne(lessonId);

        return this.resourcesRepository.find({
            where: { lesson: { id: lessonId } },
            order: { createdAt: 'ASC' },
        });
    }

    async create(
        lessonId: string,
        file: Express.Multer.File,
        title?: string,
    ): Promise<LessonResource> {
        // 404 antes de gastar una subida si la lección no existe.
        await this.lessonsService.findOne(lessonId);

        // El mimetype lo declara el cliente; esto mira el contenido real.
        assertMagicBytes(file, 'pdf');

        const uploaded = await this.cloudinary.uploadPrivateFile(
            file,
            UPLOAD_FOLDERS.LESSON_RESOURCES,
        );

        const resource = this.resourcesRepository.create({
            title: title?.trim() || file.originalname,
            publicId: uploaded.publicId,
            sizeBytes: uploaded.bytes,
            lesson: { id: lessonId } as never,
        });

        return this.resourcesRepository.save(resource);
    }

    /**
     * Devuelve una URL firmada y con vencimiento, sólo si el usuario tiene
     * acceso al contenido del curso. Acá sí se responde 403 (a diferencia de
     * GET /lessons/:id, que devuelve 200 con content:null para poder mostrar
     * el CTA de compra): de un archivo no hay nada parcial que mostrar.
     */
    async getDownloadUrl(
        lessonId: string,
        resourceId: string,
        user: AccessActor,
    ): Promise<{ url: string; expiresAt: string; title: string }> {
        const lesson = await this.lessonsService.findOne(lessonId);

        const hasAccess = await this.lessonsAccess.canAccessCourseContent(
            user,
            lesson.module?.course,
        );
        if (!hasAccess) {
            throw new ForbiddenException(
                'No tenés acceso al contenido de este curso.',
            );
        }

        const resource = await this.findOneOrFail(lessonId, resourceId);
        const url = this.cloudinary.getSignedUrl(
            resource.publicId,
            DOWNLOAD_TTL_SECONDS,
        );

        return {
            url,
            expiresAt: new Date(
                Date.now() + DOWNLOAD_TTL_SECONDS * 1000,
            ).toISOString(),
            title: resource.title,
        };
    }

    /**
     * Borrado físico: un adjunto no tiene historial que preservar (a diferencia
     * de lecciones o inscripciones, donde el borrado es lógico). Se borra
     * primero en Cloudinary para no dejar archivos huérfanos pagando espacio.
     */
    async remove(lessonId: string, resourceId: string): Promise<void> {
        const resource = await this.findOneOrFail(lessonId, resourceId);

        await this.cloudinary.destroy(resource.publicId, 'raw', 'authenticated');
        await this.resourcesRepository.remove(resource);
    }

    /** Exige que el recurso pertenezca a ESA lección, no sólo que exista. */
    private async findOneOrFail(
        lessonId: string,
        resourceId: string,
    ): Promise<LessonResource> {
        const resource = await this.resourcesRepository.findOne({
            where: { id: resourceId, lesson: { id: lessonId } },
        });

        if (!resource) {
            throw new NotFoundException(
                `Recurso con id ${resourceId} no encontrado en la lección ${lessonId}`,
            );
        }

        return resource;
    }
}
