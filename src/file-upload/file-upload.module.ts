import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

/**
 * Módulo sin controllers a propósito: no hay un endpoint genérico
 * `/file-upload`. Cada dominio expone su propia ruta de subida
 * (POST /courses/:id/image, PATCH /users/me/avatar, ...) porque cada una tiene
 * su propio control de acceso y su propia entidad que actualizar.
 *
 * Acá vive sólo el acceso a Cloudinary, que los módulos de dominio importan.
 */
@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class FileUploadModule { }
