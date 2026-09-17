import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';

// Solo registra la entidad para que TypeORM la vea.
// TODO: agregar service y controller en otra tarea (ver contrato de API, módulo 13).
@Module({ imports: [TypeOrmModule.forFeature([Notification])] })
export class NotificationsModule { }
