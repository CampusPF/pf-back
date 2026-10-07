import { Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CronSecretGuard } from './cron-secret.guard';
import { CoursePushRemindersService } from '../push/course-push-reminders.service';
import { RemindersService } from '../notifications/reminders.service';

/**
 * Disparadores de las tareas programadas, para un cron EXTERNO.
 *
 * Por qué existe: los dos recordatorios se agendan con `CronJob` dentro del
 * proceso de Nest (SchedulerRegistry). Eso funciona mientras el proceso esté
 * vivo, pero en un plan que duerme por inactividad —el caso de Render free—
 * a las 19:00 puede no haber nadie despierto y la corrida simplemente no
 * ocurre, sin error ni log. Un cron externo que pega acá despierta el
 * servicio y garantiza la ejecución.
 *
 * Los crons internos siguen activos y NO hay que apagarlos: las dos tareas
 * son idempotentes a propósito (los recordatorios por mail deduplican por
 * semana ISO, y los push respetan COURSE_PUSH_MIN_INTERVAL_DAYS), así que si
 * llegan a correr las dos veces nadie recibe nada repetido.
 *
 * Fuera de Swagger (`ApiExcludeController`): no es parte de la API pública y
 * no tiene sentido anunciarlo.
 */
@ApiExcludeController()
@Controller('tasks')
@Public()
@UseGuards(CronSecretGuard)
@SkipThrottle()
export class TasksController {
    private readonly logger = new Logger(TasksController.name);

    constructor(
        private readonly coursePushReminders: CoursePushRemindersService,
        private readonly reminders: RemindersService,
    ) { }

    /** Recordatorios push de cursos inactivos. Pensado para una vez por día. */
    @Post('course-push-reminders')
    @HttpCode(HttpStatus.OK)
    async runCoursePushReminders() {
        this.logger.log('Cron externo: recordatorios push de cursos');
        return this.coursePushReminders.run();
    }

    /** Recordatorios semanales por mail (alumnos y docentes inactivos). */
    @Post('weekly-reminders')
    @HttpCode(HttpStatus.OK)
    async runWeeklyReminders() {
        this.logger.log('Cron externo: recordatorios semanales por mail');
        return this.reminders.runAll();
    }

    /**
     * No hace nada: sirve para que el cron externo despierte el servicio y
     * para comprobar que el secreto quedó bien configurado sin mandarle un
     * mail ni una notificación a nadie.
     */
    @Post('ping')
    @HttpCode(HttpStatus.OK)
    ping() {
        return { ok: true, at: new Date().toISOString() };
    }
}
