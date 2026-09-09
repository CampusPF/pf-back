import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from './entities/subscription.entity';

/** Precio de cada plan en centavos de USD (la unidad que espera Stripe). */
export const PLAN_PRICES_IN_CENTS: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 0,
  [SubscriptionPlan.PREMIUM]: 999,
};

/** Moneda en la que se cobran los planes. */
export const PLAN_CURRENCY = 'usd';

/** Vigencia de una suscripción activada, en meses. */
const SUBSCRIPTION_MONTHS = 1;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
  ) { }

  /** Precio del plan en centavos. FREE = 0 (no se cobra). */
  getPlanPriceInCents(plan: SubscriptionPlan): number {
    return PLAN_PRICES_IN_CENTS[plan];
  }

  /** ¿El usuario ya tiene una suscripción ACTIVE? */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const count = await this.subscriptionsRepository.count({
      where: { user: { id: userId }, status: SubscriptionStatus.ACTIVE },
    });
    return count > 0;
  }

  /**
   * Alta de una suscripción a partir de un pago YA confirmado por el webhook
   * de Stripe. Es el ÚNICO camino para activar un plan: no hay más un
   * endpoint que lo haga desde una respuesta del navegador.
   *
   * Idempotente: si ya hay una suscripción ACTIVE (webhook duplicado, doble
   * pestaña), devuelve esa en vez de crear otra.
   */
  async activateFromPayment(
    userId: string,
    plan: SubscriptionPlan,
    amountInCents: number,
  ): Promise<Subscription> {
    const existingActive = await this.subscriptionsRepository.findOne({
      where: { user: { id: userId }, status: SubscriptionStatus.ACTIVE },
    });
    if (existingActive) return existingActive;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + SUBSCRIPTION_MONTHS);

    const subscription = this.subscriptionsRepository.create({
      user: { id: userId },
      plan,
      status: SubscriptionStatus.ACTIVE,
      startDate,
      endDate,
      lastPaymentAmount: amountInCents / 100,
    });

    return this.subscriptionsRepository.save(subscription);
  }

  findAll(): Promise<Subscription[]> {
    return this.subscriptionsRepository.find({
      relations: { user: true },
    });
  }

  async findMine(userId: string): Promise<Subscription[]> {
    return this.subscriptionsRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionsRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!subscription) throw new NotFoundException(`Suscripción ${id} no encontrada`);
    return subscription;
  }

  async cancel(id: string, userId: string): Promise<Subscription> {
    const subscription = await this.subscriptionsRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!subscription) throw new NotFoundException(`Suscripción ${id} no encontrada`);
    if (subscription.user.id !== userId) {
      // 403, no 409: es un problema de permisos sobre un recurso ajeno, no un
      // conflicto de estado.
      throw new ForbiddenException('No podés cancelar la suscripción de otro usuario');
    }

    subscription.status = SubscriptionStatus.CANCELLED;
    return this.subscriptionsRepository.save(subscription);
  }
}