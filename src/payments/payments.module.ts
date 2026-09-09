import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { Payment } from './entities/payment.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollmentsModule } from '../course-enrollments/course-enrollments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Payment, Course]),
        CourseEnrollmentsModule,
        SubscriptionsModule,
    ],
    controllers: [PaymentsController],
    providers: [PaymentsService, StripeService],
})
export class PaymentsModule { }
