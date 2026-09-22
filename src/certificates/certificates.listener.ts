import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, CourseRenamedEvent } from '../events';
import { CertificatesService } from './certificates.service';

/**
 * Regenera los PDF de un curso cuando se renombra, para que los certificados
 * ya emitidos muestren el nombre nuevo.
 *
 * `async: true` para no demorar la respuesta del PATCH del curso: regenerar
 * son N PDFs y N subidas. Si algo falla acá, `findMine` lo repara la próxima
 * vez que el alumno liste sus certificados.
 */
@Injectable()
export class CertificatesListener {
    private readonly logger = new Logger(CertificatesListener.name);

    constructor(private readonly certificatesService: CertificatesService) { }

    @OnEvent(EVENTS.COURSE_RENAMED, { async: true })
    async onCourseRenamed(event: CourseRenamedEvent): Promise<void> {
        try {
            await this.certificatesService.refreshCourse(event.courseId);
        } catch (error) {
            this.logger.error(
                `No se pudieron regenerar los certificados del curso ${event.courseId}`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }
}
