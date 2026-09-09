import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateIntentDto } from './create-intent.dto';
import { SubscriptionPlan } from '../../subscriptions/entities/subscription.entity';

function errorsFor(payload: unknown) {
    return validateSync(plainToInstance(CreateIntentDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
}

describe('CreateIntentDto', () => {
    it('acepta solo courseId', () => {
        expect(
            errorsFor({ courseId: '8a01e21a-a392-4e93-bf76-8d1f4a4ef650' }),
        ).toHaveLength(0);
    });

    it('acepta solo planId', () => {
        expect(errorsFor({ planId: SubscriptionPlan.PREMIUM })).toHaveLength(0);
    });

    it('rechaza body vacío {}', () => {
        expect(errorsFor({}).length).toBeGreaterThan(0);
    });

    it('rechaza courseId + planId juntos', () => {
        expect(
            errorsFor({
                courseId: '8a01e21a-a392-4e93-bf76-8d1f4a4ef650',
                planId: SubscriptionPlan.PREMIUM,
            }).length,
        ).toBeGreaterThan(0);
    });

    it('rechaza un courseId que no es UUID', () => {
        expect(errorsFor({ courseId: 'no-uuid' }).length).toBeGreaterThan(0);
    });
});
