import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateAutomationDto, UpdateAutomationChannelDto } from './dto/create-automation.dto';
import { AutomationView, ChannelsView, GolondrinaService } from './golondrina.service';

interface Actor {
    id: string;
    role?: UserRole;
}

/**
 * Golondrina desde el asistente de cada lección. Todo es del usuario logueado
 * (`/golondrina/me/...`): nadie ve ni toca las automatizaciones de otro.
 */
@ApiTags('golondrina')
@ApiBearerAuth()
@Controller('golondrina/me')
export class GolondrinaController {
    constructor(private readonly golondrina: GolondrinaService) { }

    @Get('channels')
    @ApiOperation({ summary: 'Por qué canales le pueden llegar los avisos (push, mail, campanita)' })
    channels(@CurrentUser() user: Actor): Promise<ChannelsView> {
        return this.golondrina.channels(user.id);
    }

    @Get('automations')
    @ApiQuery({ name: 'lessonId', required: false })
    @ApiOperation({ summary: 'Mis automatizaciones (opcionalmente de una lección)' })
    list(
        @CurrentUser() user: Actor,
        @Query('lessonId', new ParseUUIDPipe({ optional: true })) lessonId?: string,
    ): Promise<AutomationView[]> {
        return this.golondrina.listMine(user.id, lessonId);
    }

    @Post('automations')
    @ApiOperation({ summary: 'Activar una acción en una lección (si ya estaba, la reprograma)' })
    create(@CurrentUser() user: Actor, @Body() dto: CreateAutomationDto): Promise<AutomationView> {
        return this.golondrina.create({ id: user.id, role: user.role }, dto.lessonId, dto.action, dto.channel);
    }

    @Patch('automations/:id')
    @ApiOperation({ summary: 'Cambiar el canal de una automatización' })
    updateChannel(
        @CurrentUser() user: Actor,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAutomationChannelDto,
    ): Promise<AutomationView> {
        return this.golondrina.updateChannel(user.id, id, dto.channel);
    }

    @Delete('automations/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Apagar una automatización' })
    cancel(@CurrentUser() user: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
        return this.golondrina.cancel(user.id, id);
    }
}
