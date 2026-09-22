import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { EVENTS, CertificateIssuedEvent } from '../events';
import { Certificate } from './entities/certificate.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { CloudinaryService, UPLOAD_FOLDERS } from '../file-upload/cloudinary.service';
import { generateCertificatePdf } from './certificate-pdf';
import { QuizzesService } from '../quizzes/quizzes.service';

/** Lo que ve cualquiera que verifique un código, sin estar logueado. */
export interface PublicVerification {
    valido: boolean;
    nombreAlumno?: string;
    curso?: string;
    /** Minutos de contenido; el front decide cómo escribirlos. */
    minutos?: number;
    fechaEmision?: Date;
}

/** Sin vocales ni caracteres que se confundan (0/O, 1/I): el código se dicta y se tipea. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class CertificatesService {
    private readonly logger = new Logger(CertificatesService.name);

    constructor(
        @InjectRepository(Certificate)
        private readonly certificateRepository: Repository<Certificate>,
        @InjectRepository(CourseEnrollment)
        private readonly enrollmentsRepository: Repository<CourseEnrollment>,
        @InjectRepository(Lesson)
        private readonly lessonsRepository: Repository<Lesson>,
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        private readonly cloudinary: CloudinaryService,
        private readonly config: ConfigService,
        private readonly eventEmitter: EventEmitter2,
        private readonly quizzesService: QuizzesService,
    ) { }

    /**
     * Emite el certificado de un curso terminado: valida, genera el PDF con el
     * QR, lo sube a Cloudinary y guarda el registro.
     *
     * El orden importa. Se valida TODO antes de generar nada: generar un PDF y
     * subirlo a Cloudinary para después descubrir que el curso no estaba
     * terminado dejaría un archivo huérfano pago en el media library.
     */
    async issue(userId: string, courseId: string): Promise<Certificate> {
        // 1. Uno por usuario y curso. El único de la tabla lo respalda; este
        //    chequeo previo existe para devolver un 409 claro en vez del error
        //    crudo de Postgres.
        const existing = await this.certificateRepository.findOne({
            where: { userId, courseId },
        });
        if (existing) {
            throw new ConflictException('Ya tenés un certificado para este curso');
        }

        // 2. Tiene que estar inscripto y haber terminado el curso.
        const enrollment = await this.enrollmentsRepository.findOne({
            where: { student: { id: userId }, course: { id: courseId }, isActive: true },
            relations: { student: true, course: true },
        });
        if (!enrollment) {
            throw new NotFoundException('No estás inscripto en este curso');
        }

        /* `progressPercent` es la columna derivada que recalcula
           LessonProgressService cada vez que se marca o desmarca una lección:
           es la misma fuente que ve el alumno en su progreso, así que no puede
           pasar que la barra diga 100% y acá diga otra cosa. */
        if (enrollment.progressPercent < 100) {
            throw new BadRequestException(
                `Todavía no completaste el curso (vas por el ${enrollment.progressPercent}%)`,
            );
        }

        // Además del 100% de lecciones, tienen que estar aprobados todos los
        // checkpoints del curso (los de módulo y el de fin de curso). El front
        // muestra este mensaje tal cual.
        const quizzesOk = await this.quizzesService.hasPassedAllQuizzes(userId, courseId);
        if (!quizzesOk) {
            throw new BadRequestException(
                'Te falta aprobar un checkpoint del curso para obtener el certificado',
            );
        }

        // 3. Código corto y único.
        const code = await this.generateUniqueCode();

        // 4. PDF con el QR, a Cloudinary con el código como public_id.
        const issuedAt = new Date();
        const pdfUrl = await this.renderAndUpload({
            code,
            studentName: enrollment.student.name,
            courseTitle: enrollment.course.title,
            courseId,
            issuedAt,
        });

        // 5. Recién ahora se guarda la fila.
        const certificate = await this.certificateRepository.save(
            this.certificateRepository.create({
                userId,
                courseId,
                code,
                pdfUrl,
                courseTitle: enrollment.course.title,
            }),
        );

        await this.notifyIssued(userId, enrollment.course.title, code);

        /* Avisa que hay un certificado nuevo. Hoy lo escucha la evaluación de
           logros (el logro `first_certificate` no se desbloquearía nunca si
           dependiera sólo de los eventos de lección: el que termina su último
           curso no completa ninguna lección más). Mañana puede escucharlo el
           mail, sin volver a tocar este service. */
        this.eventEmitter.emit(
            EVENTS.CERTIFICATE_ISSUED,
            new CertificateIssuedEvent(userId, courseId, code),
        );

        return certificate;
    }

    /**
     * Mis certificados, del más nuevo al más viejo.
     *
     * Cada uno pasa por `ensureUpToDate`: es la red de seguridad del listener
     * de COURSE_RENAMED (si falló o el server se reinició a mitad de camino)
     * y lo que actualiza los emitidos antes de guardar `courseTitle`. Si ya
     * están al día, no se hace nada más que comparar dos strings.
     */
    async findMine(userId: string): Promise<Certificate[]> {
        const certificates = await this.certificateRepository.find({
            where: { userId },
            relations: { course: true },
            order: { issuedAt: 'DESC' },
        });

        // En serie: regenerar es CPU (pdfkit) + una subida, y en Render la
        // memoria es poca.
        const result: Certificate[] = [];
        for (const certificate of certificates) {
            result.push(await this.ensureUpToDate(certificate));
        }
        return result;
    }

    /**
     * Regenera los certificados de un curso que se renombró. Lo llama
     * CertificatesListener; uno por uno, por el mismo motivo que findMine.
     */
    async refreshCourse(courseId: string): Promise<void> {
        const certificates = await this.certificateRepository.find({
            where: { courseId },
            relations: { course: true },
        });

        for (const certificate of certificates) {
            await this.ensureUpToDate(certificate);
        }
    }

    /**
     * Si el PDF quedó desactualizado, lo vuelve a generar con el nombre actual
     * del curso y lo sube encima del anterior.
     *
     * El código, el QR y la fecha de emisión son los originales: cambia el
     * contenido, no el certificado. El `public_id` es el mismo (`<code>.pdf`),
     * así que la ruta en Cloudinary no cambia; sólo el `v<version>` de la URL,
     * y por eso se guarda la `pdfUrl` nueva — la URL versionada evita que el
     * navegador muestre una copia cacheada con el nombre viejo.
     *
     * Best effort: si algo falla se loguea y se devuelve el certificado como
     * estaba. Su `pdfUrl` sigue sirviendo, y el próximo listado lo reintenta.
     */
    async ensureUpToDate(certificate: Certificate): Promise<Certificate> {
        if (!this.isStale(certificate)) return certificate;

        try {
            const withUser = certificate.user
                ? certificate
                : await this.certificateRepository.findOneOrFail({
                    where: { id: certificate.id },
                    relations: { user: true, course: true },
                });

            const previousUrl = certificate.pdfUrl;
            const pdfUrl = await this.renderAndUpload({
                code: certificate.code,
                studentName: withUser.user.name,
                courseTitle: certificate.course.title,
                courseId: certificate.courseId,
                issuedAt: certificate.issuedAt,
            });

            await this.certificateRepository.update(certificate.id, {
                pdfUrl,
                courseTitle: certificate.course.title,
            });

            await this.removeLegacyPdf(previousUrl);

            return { ...certificate, pdfUrl, courseTitle: certificate.course.title };
        } catch (error) {
            this.logger.error(
                `No se pudo regenerar el certificado ${certificate.code}`,
                error instanceof Error ? error.stack : String(error),
            );
            return certificate;
        }
    }

    /**
     * Desactualizado = el curso cambió de nombre desde que se generó el PDF, o
     * el PDF es de antes de subirse con extensión (una URL sin ".pdf" se
     * entrega como descarga y no se puede ver en el visor).
     */
    private isStale(certificate: Certificate): boolean {
        return (
            certificate.courseTitle !== certificate.course.title ||
            !certificate.pdfUrl.endsWith('.pdf')
        );
    }

    /**
     * Los certificados viejos se subieron sin ".pdf" en el public_id, así que
     * regenerarlos crea un archivo NUEVO (`<code>.pdf`) y el anterior queda
     * huérfano. Se borra; `destroy` no lanza.
     */
    private async removeLegacyPdf(previousUrl: string): Promise<void> {
        if (previousUrl.endsWith('.pdf')) return;

        const publicId = previousUrl.match(/\/raw\/upload\/(?:v\d+\/)?(.+)$/)?.[1];
        if (publicId) await this.cloudinary.destroy(publicId, 'raw');
    }

    /**
     * Arma el PDF (con el QR a la verificación pública) y lo sube a
     * Cloudinary. Devuelve la URL.
     */
    private async renderAndUpload(data: {
        code: string;
        studentName: string;
        courseTitle: string;
        courseId: string;
        issuedAt: Date;
    }): Promise<string> {
        const verifyUrl = `${this.frontendBaseUrl()}/certificados/verificar/${data.code}`;
        const qrBuffer = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 300 });

        const pdfBuffer = await generateCertificatePdf({
            studentName: data.studentName,
            courseName: data.courseTitle,
            minutes: await this.courseMinutes(data.courseId),
            date: this.formatDate(data.issuedAt),
            code: data.code,
            qrBuffer,
        });

        // El código es el public_id: volver a subirlo sobrescribe el archivo.
        const uploaded = await this.cloudinary.uploadPublicPdf(
            pdfBuffer,
            UPLOAD_FOLDERS.CERTIFICATES,
            data.code,
        );
        return uploaded.url;
    }

    /**
     * Verificación PÚBLICA por código.
     *
     * Devuelve sólo lo que puede ver cualquiera: nombre, curso, duración y fecha.
     * Nada de ids internos, ni el mail del alumno, ni la URL del PDF.
     *
     * Un código inexistente devuelve `{ valido: false }` con 200, no un 404:
     * esto es una verificación, no la búsqueda de un recurso. La respuesta
     * "este código no es válido" ES la respuesta correcta a la pregunta, y le
     * evita al front tener que distinguir un 404 esperable de uno roto.
     */
    async verify(code: string): Promise<PublicVerification> {
        const certificate = await this.certificateRepository.findOne({
            where: { code },
            relations: { user: true, course: true },
        });

        if (!certificate) return { valido: false };

        return {
            valido: true,
            nombreAlumno: certificate.user.name,
            curso: certificate.course.title,
            minutos: await this.courseMinutes(certificate.courseId),
            fechaEmision: certificate.issuedAt,
        };
    }

    /**
     * MINUTOS de contenido del curso: la suma de la duración de sus lecciones
     * vivas.
     *
     * Antes devolvía horas con `Math.ceil`, y eso hacía que cursos claramente
     * distintos dijeran lo mismo: 83 min y 115 min daban los dos "2 horas".
     * El redondeo ahora no existe — el minuto crudo viaja hasta el formateador,
     * que decide cómo escribirlo (ver formatCourseDuration).
     */
    private async courseMinutes(courseId: string): Promise<number> {
        const row = await this.lessonsRepository
            .createQueryBuilder('lesson')
            .innerJoin('lesson.module', 'module')
            .where('module.course = :courseId', { courseId })
            .andWhere('lesson.isActive = true')
            .andWhere('module.isActive = true')
            .select('COALESCE(SUM(lesson.durationMinutes), 0)', 'total')
            .getRawOne<{ total: string }>();

        return Number(row?.total ?? 0);
    }

    /**
     * Código tipo "CMP-8F3K2A".
     *
     * Con 32 caracteres posibles y 6 posiciones hay ~10^9 combinaciones, así
     * que una colisión es rarísima — pero "rarísima" no es "imposible" y la
     * columna es única, así que se reintenta en vez de explotar con un 500.
     */
    private async generateUniqueCode(): Promise<string> {
        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            const code = this.randomCode();
            const taken = await this.certificateRepository.exists({ where: { code } });
            if (!taken) return code;
        }

        throw new ConflictException(
            'No se pudo generar un código de certificado. Intentá de nuevo.',
        );
    }

    private randomCode(): string {
        let suffix = '';
        for (let i = 0; i < CODE_LENGTH; i++) {
            suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
        }
        return `CMP-${suffix}`;
    }

    /**
     * FRONTEND_URL puede ser una LISTA separada por comas (se usa también para
     * CORS). Para armar el link del QR hace falta una sola: se toma la primera.
     */
    private frontendBaseUrl(): string {
        const raw = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
        return raw.split(',')[0].trim().replace(/\/$/, '');
    }

    private formatDate(date: Date): string {
        return date.toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    /**
     * Notificación in-app de que el certificado está listo.
     *
     * Best effort: el certificado YA se emitió y se subió bien, así que un
     * fallo acá no puede hacer fallar la respuesta. Queda el log.
     *
     * `sentAt` queda en null y el canal es 'in_app' únicamente: todavía no hay
     * infraestructura de mails (es otra tarea). Cuando la haya, esta misma fila
     * es la que el cron va a poder mandar por mail.
     */
    private async notifyIssued(
        userId: string,
        courseTitle: string,
        code: string,
    ): Promise<void> {
        try {
            await this.notificationRepository
                .createQueryBuilder()
                .insert()
                .into(Notification)
                .values({
                    userId,
                    type: 'certificate_issued',
                    channel: 'in_app',
                    title: '¡Tu certificado está listo!',
                    message: `Completaste "${courseTitle}". Ya podés descargar y compartir tu certificado.`,
                    link: `/certificados/verificar/${code}`,
                    // Una notificación por certificado, aunque esto se llame dos veces.
                    dedupeKey: `certificate-issued:${code}`,
                })
                .orIgnore()
                .execute();
        } catch (error) {
            this.logger.error(
                `Certificado ${code} emitido, pero no se pudo crear la notificación`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }
}
