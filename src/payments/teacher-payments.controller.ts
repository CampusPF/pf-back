import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PaymentsService, TeacherPaymentRow } from './payments.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';

/**
 * Reporte de ventas de cursos. Va en un controller aparte (no dentro de
 * PaymentsController) porque la ruta NO cuelga de `/payments`: es
 * `/teacher/payments`, mismo criterio que CertificatesController con
 * `@Controller()` vacío y la ruta completa en el método.
 *
 * RolesGuard no es global (ver app.module.ts): hay que aplicarlo acá a mano,
 * junto con @Roles().
 */
@ApiTags('payments')
@Controller()
export class TeacherPaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Get('teacher/payments')
    @UseGuards(RolesGuard)
    @Roles(UserRole.TEACHER, UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Ventas de cursos: las mías (docente) o todas (admin)',
        description:
            'El docente ve sólo las ventas de sus propios cursos. El admin ve las de ' +
            'todos los docentes. Las suscripciones no entran acá: esa plata es de la ' +
            'plataforma, no de un curso puntual.',
    })
    @ApiResponse({ status: 403, description: 'Sólo docentes y administradores' })
    getTeacherPayments(
        @CurrentUser() user: { id: string; role: UserRole },
    ): Promise<TeacherPaymentRow[]> {
        return this.paymentsService.getTeacherPayments(user);
    }
}
