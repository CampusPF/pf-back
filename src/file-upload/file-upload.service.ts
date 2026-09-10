import { Injectable } from '@nestjs/common';
import { CreateFileUploadDto } from './dto/create-file-upload.dto';
import { UpdateFileUploadDto } from './dto/update-file-upload.dto';
import { EntityClassType } from './types/entity-class.type';

@Injectable()
export class FileUploadService {
  create(createFileUploadDto: CreateFileUploadDto) {
    return 'This action adds a new fileUpload';
  }
  uploadFile(file: Express.Multer.File, id: any, object: EntityClassType) {
    //*1 Verificar que el objeto exista en base de datos

    //* 2. Si el objeto existe cargamaos imagen en cloudinary:

    //* 3. Se actualiza la imágen en la BD

    //* 4. Retorna el objeto modificado:


    return 'This action adds a new fileUpload';
  }

  findAll() {
    return `This action returns all fileUpload`;
  }

  findOne(id: number) {
    return `This action returns a #${id} fileUpload`;
  }

  update(id: number, updateFileUploadDto: UpdateFileUploadDto) {
    return `This action updates a #${id} fileUpload`;
  }

  remove(id: number) {
    return `This action removes a #${id} fileUpload`;
  }
}
