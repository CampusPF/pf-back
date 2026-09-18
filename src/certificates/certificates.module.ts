import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certificate } from './entities/certificate.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { FileUploadModule } from '../file-upload/file-upload.module';

/**
 * Certificados: emisión (PDF + QR + Cloudinary) y verificación pública.
 *
 * Reusa el CloudinaryService de FileUploadModule — no configura el SDK por su
 * cuenta ni lee las credenciales de nuevo.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([Certificate, CourseEnrollment, Lesson, Notification]),
        FileUploadModule,
    ],
    controllers: [CertificatesController],
    providers: [CertificatesService],
    exports: [CertificatesService],
})
export class CertificatesModule { }
