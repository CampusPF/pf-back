import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Emisión y verificación de certificados.
 *
 * Dos rutas privadas (emitir y listar los míos) y una pública (verificar un
 * código). El alumno sale siempre del JWT: nunca se emite ni se lista por un
 * userId que mande el cliente.
 *
 * La autenticación la aplica el JwtAuthGuard global; la verificación pública
 * se sale de eso con @Public().
 */
@ApiTags('certificates')
@Controller()
export class CertificatesController {
    constructor(private readonly certificatesService: CertificatesService) { }

    @Post('courses/:courseId/certificate')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Emitir mi certificado de un curso completado' })
    @ApiResponse({ status: 201, description: 'Certificado emitido' })
    @ApiResponse({ status: 400, description: 'Todavía no completaste el curso' })
    @ApiResponse({ status: 404, description: 'No estás inscripto en este curso' })
    @ApiResponse({ status: 409, description: 'Ya tenés un certificado para este curso' })
    issue(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.certificatesService.issue(userId, courseId);
    }

    @Get('certificates/me')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mis certificados' })
    findMine(@CurrentUser('id') userId: string) {
        return this.certificatesService.findMine(userId);
    }

    /**
     * Verificación pública: es el destino del QR impreso en el PDF, así que
     * tiene que abrir sin login. Devuelve sólo datos públicos.
     *
     * Un código inválido responde 200 con `{ valido: false }`, no 404: ver
     * CertificatesService.verify.
     */
    @Get('certificates/:code')
    @Public()
    @ApiOperation({ summary: 'Verificar un certificado por su código (público)' })
    @ApiOkResponse({
        schema: {
            example: {
                valido: true,
                nombreAlumno: 'María González',
                curso: 'Introducción a NestJS',
                horas: 3,
                fechaEmision: '2026-09-17T08:41:08.504Z',
            },
        },
    })
    verify(@Param('code') code: string) {
        return this.certificatesService.verify(code);
    }
}
