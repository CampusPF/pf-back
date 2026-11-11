import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LessonsModule } from '../lessons/lessons.module';
import { User } from '../users/entities/user.entity';
import { PushModule } from '../push/push.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GolondrinaAutomation } from './entities/golondrina-automation.entity';
import { GolondrinaController } from './golondrina.controller';
import { GolondrinaListener } from './golondrina.listener';
import { GolondrinaService } from './golondrina.service';

/**
 * Golondrina: automatizaciones de un clic desde el asistente de cada lección
 * (recordatorio, plan de estudio, resumen, aviso de respuesta del docente).
 * Manda por los canales que ya existen: push (PushModule), mail y campanita
 * (NotificationsModule). GolondrinaService se exporta para el disparador
 * externo de TasksModule.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([GolondrinaAutomation, Lesson, User]),
        LessonsModule,
        PushModule,
        NotificationsModule,
    ],
    controllers: [GolondrinaController],
    providers: [GolondrinaService, GolondrinaListener],
    exports: [GolondrinaService],
})
export class GolondrinaModule { }
