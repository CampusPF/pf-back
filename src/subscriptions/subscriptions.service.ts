import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from './entities/subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

const PLAN_PRICES: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 0,
  [SubscriptionPlan.PREMIUM]: 9.99,
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
  ) { }

  async subscribe(userId: string, dto: CreateSubscriptionDto): Promise<Subscription> {
    const existingActive = await this.subscriptionsRepository.findOne({
      where: { user: { id: userId }, status: SubscriptionStatus.ACTIVE },
    });
    if (existingActive) {
      throw new ConflictException('Ya tenés una suscripción activa');
    }

    // --- Simulación de pago: acá iría la llamada real a Stripe/Mercado Pago ---
    // TODO(seguridad): CRÍTICO antes de producción. Hoy el pago se aprueba
    // solo, así que cualquier usuario logueado se da de alta el plan PREMIUM
    // gratis con un POST /subscriptions.
    //
    // Cuando se integre Mercado Pago hay que, como mínimo:
    //  1. Crear la preferencia de pago desde el backend con MP_ACCESS_TOKEN
    //     (nunca desde el front) y dejar la suscripción en estado pendiente.
    //  2. Activar el plan SOLO desde el webhook de MP, nunca desde una
    //     respuesta del navegador (el usuario puede falsificarla).
    //  3. En el webhook: validar la firma (header x-signature + x-request-id,
    //     HMAC con MP_WEBHOOK_SECRET) y devolver 401 si no valida.
    //  4. No confiar en el body: con el payment id que llega, re-consultar el
    //     estado real del pago contra la API de MP y recién ahí activar.
    //  5. Idempotencia: guardar el payment id procesado (columna única) para
    //     que un reenvío de la notificación no active/cobre dos veces.
    //  6. El endpoint del webhook va @Public() a propósito (MP no manda
    //     nuestro JWT), protegido únicamente por la validación de firma.
    //
    // No se deja el código escrito porque no hay SDK de MP instalado ni
    // entidad de pagos en el modelo: definir eso es una decisión de negocio
    // (¿pago único o suscripción recurrente? ¿qué pasa al vencer?).
    const paymentSucceeded = true; // siempre "aprueba", es una simulación
    if (!paymentSucceeded) {
      throw new ConflictException('El pago fue rechazado');
    }
    // ---------------------------------------------------------------------

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // 1 mes de vigencia

    const subscription = this.subscriptionsRepository.create({
      user: { id: userId },
      plan: dto.plan,
      status: SubscriptionStatus.ACTIVE,
      startDate,
      endDate,
      lastPaymentAmount: PLAN_PRICES[dto.plan],
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