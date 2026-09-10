import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FileUpload } from "./entities/file-upload.entity";
import { UploadApiResponse, v2 } from "cloudinary";
import { createReadStream } from "fs";
import toStream = require('buffer-to-stream');

@Injectable()
export class FileUploadRepository {
    async uploadFile(file: Express.Multer.File): Promise<UploadApiResponse> {
        return new Promise((resolve, reject) => {
            const upload = v2.uploader.upload_stream(
                { resource_type: 'auto' },
                (error, result) => {
                    if (error || !result) {
                        reject(error || new Error('Error al cargar imágen en Cloudinary'))
                    }
                    else resolve(result)
                }
            );

            toStream(file.buffer).pipe(upload);
        })
    }
}