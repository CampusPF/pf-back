import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';

// Solo registra las entidades para que TypeORM las vea.
// TODO: agregar service y controller en otra tarea.
@Module({ imports: [TypeOrmModule.forFeature([Achievement, UserAchievement])] })
export class AchievementsModule { }
