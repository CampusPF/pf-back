import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { GOLONDRINA_ACTIONS, GOLONDRINA_CHANNELS } from '../golondrina.actions';
import type { GolondrinaAction, GolondrinaChannel } from '../golondrina.actions';

export class CreateAutomationDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    lessonId: string;

    @ApiProperty({ enum: GOLONDRINA_ACTIONS })
    @IsIn(GOLONDRINA_ACTIONS)
    action: GolondrinaAction;

    @ApiProperty({ enum: GOLONDRINA_CHANNELS, description: 'push = celular, email = mail, in_app = campanita' })
    @IsIn(GOLONDRINA_CHANNELS)
    channel: GolondrinaChannel;
}

export class UpdateAutomationChannelDto {
    @ApiProperty({ enum: GOLONDRINA_CHANNELS })
    @IsIn(GOLONDRINA_CHANNELS)
    channel: GolondrinaChannel;
}
