import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certificate } from './entities/certificate.entity';

// Solo registra la entidad para que TypeORM la vea.
// TODO: agregar service y controller en otra tarea.
@Module({ imports: [TypeOrmModule.forFeature([Certificate])] })
export class CertificatesModule { }
