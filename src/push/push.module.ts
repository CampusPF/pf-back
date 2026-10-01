import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PushSubscription } from './entities/push-subscription.entity';
import { CoursePushReminder } from './entities/course-push-reminder.entity';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { CoursePushRemindersService } from './course-push-reminders.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([PushSubscription, CoursePushReminder]),
        AuthModule,
    ],
    controllers: [PushController],
    providers: [PushService, CoursePushRemindersService],
    exports: [PushService],
})
export class PushModule { }
