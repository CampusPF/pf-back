import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

/** Rangos que ofrece el selector del panel. Cerrado: no es un campo libre. */
export const STATS_RANGES = [7, 30, 90, 365] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export class AdminStatsQuery {
  @ApiPropertyOptional({
    description: 'Días hacia atrás, contando hoy. Se compara contra el período anterior de igual largo.',
    enum: STATS_RANGES,
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(STATS_RANGES)
  days?: StatsRange;
}
