import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * Alta de suscripción: ya NO se hace acá. Contratar un plan pasa por
 * POST /payments/create-intent (Stripe) y la suscripción la activa el webhook
 * payment_intent.succeeded. Este controller solo expone consulta y baja.
 */
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) { }

  @Get('me')
  findMine(@CurrentUser() user: { id: string }) {
    return this.subscriptionsService.findMine(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.subscriptionsService.findAll();
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOne(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.subscriptionsService.cancel(id, user.id);
  }
}
