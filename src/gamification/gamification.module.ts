import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { XpLog } from './entities/xp-log.entity';

// Solo registra la entidad para que TypeORM la vea.
// TODO: agregar service y listeners en otra tarea.
@Module({ imports: [TypeOrmModule.forFeature([XpLog])] })
export class GamificationModule { }
