import { Type } from 'class-transformer';
import { IsString, IsUrl, MinLength, ValidateNested } from 'class-validator';

class PushKeysDto {
    @IsString()
    @MinLength(1)
    p256dh: string;

    @IsString()
    @MinLength(1)
    auth: string;
}

export class SubscribePushDto {
    @IsUrl({ require_tld: false })
    endpoint: string;

    @ValidateNested()
    @Type(() => PushKeysDto)
    keys: PushKeysDto;
}

export class UnsubscribePushDto {
    @IsUrl({ require_tld: false })
    endpoint: string;
}