import { SubscriptionsService } from './subscriptions.service';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from './entities/subscription.entity';

/**
 * Repo falso que filtra un array en memoria evaluando los FindOperator que
 * usa el service (`In`, `MoreThan`) además de igualdad simple — no se prueba
 * TypeORM, sólo que el service arma el filtro correcto. Mismo criterio que
 * payments.service.spec.ts (fake sobre un array, no un mock de `count`).
 */
function matchesCondition(value: unknown, condition: unknown): boolean {
    if (condition && typeof condition === 'object' && '_type' in (condition as object)) {
        const operator = condition as { _type: string; _value: unknown };
        if (operator._type === 'in') return (operator._value as unknown[]).includes(value);
        if (operator._type === 'moreThan') {
            return (value as Date).getTime() > (operator._value as Date).getTime();
        }
        throw new Error(`FindOperator no soportado en el fake: ${operator._type}`);
    }
    return value === condition;
}

class FakeSubscriptionsRepository {
    rows: Subscription[] = [];

    async count({ where }: { where: Record<string, unknown> }): Promise<number> {
        return this.rows.filter((row) => {
            const userCondition = where.user as { id: string } | undefined;
            if (userCondition && row.user.id !== userCondition.id) return false;
            if ('status' in where && !matchesCondition(row.status, where.status)) return false;
            if ('endDate' in where && !matchesCondition(row.endDate, where.endDate)) return false;
            return true;
        }).length;
    }

    async findOne(): Promise<Subscription | null> {
        return null;
    }

    async save(subscription: Subscription): Promise<Subscription> {
        return subscription;
    }
}

function makeSubscription(overrides: Partial<Subscription>): Subscription {
    return {
        id: overrides.id ?? 'sub-1',
        user: overrides.user ?? { id: 'user-1' },
        plan: SubscriptionPlan.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2099-01-01'),
        lastPaymentAmount: 9.99,
        createdAt: new Date('2026-01-01'),
        ...overrides,
    } as Subscription;
}

function makeService() {
    const repo = new FakeSubscriptionsRepository();
    const service = new SubscriptionsService(repo as never);
    return { service, repo };
}

const inFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const inPast = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

describe('SubscriptionsService', () => {
    it('should be defined', () => {
        expect(makeService().service).toBeDefined();
    });
});

describe('SubscriptionsService.hasActiveSubscription', () => {
    it('ACTIVE y vigente → true', async () => {
        const { service, repo } = makeService();
        repo.rows.push(makeSubscription({ status: SubscriptionStatus.ACTIVE, endDate: inFuture }));

        expect(await service.hasActiveSubscription('user-1')).toBe(true);
    });

    it('CANCELLED pero todavía dentro del período pago → true (el punto de este cambio)', async () => {
        const { service, repo } = makeService();
        repo.rows.push(makeSubscription({ status: SubscriptionStatus.CANCELLED, endDate: inFuture }));

        expect(await service.hasActiveSubscription('user-1')).toBe(true);
    });

    it('CANCELLED y ya vencida → false', async () => {
        const { service, repo } = makeService();
        repo.rows.push(makeSubscription({ status: SubscriptionStatus.CANCELLED, endDate: inPast }));

        expect(await service.hasActiveSubscription('user-1')).toBe(false);
    });

    it('ACTIVE pero vencida (nadie la pasó a EXPIRED) → false', async () => {
        const { service, repo } = makeService();
        repo.rows.push(makeSubscription({ status: SubscriptionStatus.ACTIVE, endDate: inPast }));

        expect(await service.hasActiveSubscription('user-1')).toBe(false);
    });

    it('EXPIRED → false, aunque endDate por alguna razón esté en el futuro', async () => {
        const { service, repo } = makeService();
        repo.rows.push(makeSubscription({ status: SubscriptionStatus.EXPIRED, endDate: inFuture }));

        expect(await service.hasActiveSubscription('user-1')).toBe(false);
    });

    it('sin ninguna suscripción → false', async () => {
        const { service } = makeService();
        expect(await service.hasActiveSubscription('user-1')).toBe(false);
    });

    it('no mezcla la suscripción vigente de OTRO usuario', async () => {
        const { service, repo } = makeService();
        repo.rows.push(
            makeSubscription({ user: { id: 'otro-user' } as never, status: SubscriptionStatus.ACTIVE, endDate: inFuture }),
        );

        expect(await service.hasActiveSubscription('user-1')).toBe(false);
    });
});

describe('SubscriptionsService.cancel', () => {
    it('pasa a CANCELLED sin tocar endDate — el acceso lo sigue dando hasActiveSubscription hasta esa fecha', async () => {
        const repo = new FakeSubscriptionsRepository();
        const subscription = makeSubscription({ status: SubscriptionStatus.ACTIVE, endDate: inFuture });
        repo.findOne = async () => subscription;

        const service = new SubscriptionsService(repo as never);
        const cancelled = await service.cancel(subscription.id, 'user-1');

        expect(cancelled.status).toBe(SubscriptionStatus.CANCELLED);
        expect(cancelled.endDate).toEqual(inFuture);
    });

    it('otro usuario no puede cancelar una suscripción ajena', async () => {
        const repo = new FakeSubscriptionsRepository();
        const subscription = makeSubscription({ user: { id: 'dueño' } as never });
        repo.findOne = async () => subscription;

        const service = new SubscriptionsService(repo as never);

        await expect(service.cancel(subscription.id, 'otro-usuario')).rejects.toThrow(
            'No podés cancelar la suscripción de otro usuario',
        );
    });
});
