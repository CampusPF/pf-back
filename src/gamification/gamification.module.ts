import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../courses/entities/course.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { XpLog } from './entities/xp-log.entity';
import { XpService } from './xp.service';
import { XpListener } from './xp.listener';

/**
 * XP y niveles. El nivel no se guarda: se deriva del XP total con
 * getLevelFromXp (ver xp.config.ts).
 *
 * Sin controller: el XP se muestra dentro de GET /me/dashboard, no tiene
 * endpoint propio.
 */
@Module({
    imports: [TypeOrmModule.forFeature([XpLog, Course, Lesson])],
    providers: [XpService, XpListener],
    exports: [XpService],
})
export class GamificationModule { }
