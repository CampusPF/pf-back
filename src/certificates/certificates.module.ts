import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certificate } from './entities/certificate.entity';
import { CourseEnrollment } from '../course-enrollments/entities/course-enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesListener } from './certificates.listener';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { QuizzesModule } from '../quizzes/quizzes.module';

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
        // hasPassedAllQuizzes: el certificado exige los checkpoints aprobados.
        QuizzesModule,
    ],
    controllers: [CertificatesController],
    // CertificatesListener: regenera los PDF cuando se renombra un curso.
    providers: [CertificatesService, CertificatesListener],
    exports: [CertificatesService],
})
export class CertificatesModule { }
