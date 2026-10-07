import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { CronSecretGuard } from './cron-secret.guard';

/* Endpoints para disparar las tareas programadas desde un cron externo.
   No agrega lógica propia: reusa los mismos services que usan los crons
   internos (ver el comentario de TasksController). */
@Module({
    imports: [PushModule, NotificationsModule],
    controllers: [TasksController],
    providers: [CronSecretGuard],
})
export class TasksModule { }
