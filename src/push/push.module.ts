import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
    imports: [TypeOrmModule.forFeature([PushSubscription]), AuthModule],
    controllers: [PushController],
    providers: [PushService],
    exports: [PushService],
})
export class PushModule { }