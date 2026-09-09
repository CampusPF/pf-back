import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsOptional,
    IsUUID,
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';
import { SubscriptionPlan } from '../../subscriptions/entities/subscription.entity';

/**
 * Valida a nivel de objeto que venga EXACTAMENTE uno de los campos de `keys`.
 * El contrato con el front es `{ courseId } | { planId }`, nunca ambos ni
 * ninguno.
 *
 * Se cuelga de una propiedad "ancla" SIN @IsOptional(): si se pusiera sobre
 * `courseId` o `planId`, el @IsOptional() de ese campo cortocircuitaría también
 * este validador cuando el campo viene vacío — y entonces `{}` pasaría.
 */
function ExactlyOneOf(keys: string[], options?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'exactlyOneOf',
            target: object.constructor,
            propertyName,
            constraints: [keys],
            options,
            validator: {
                validate(_: unknown, args?: ValidationArguments): boolean {
                    const group = (args?.constraints?.[0] ?? []) as string[];
                    const target = (args?.object ?? {}) as Record<string, unknown>;
                    const present = group.filter((k) => target[k] != null);
                    return present.length === 1;
                },
                defaultMessage(args?: ValidationArguments): string {
                    const group = (args?.constraints?.[0] ?? []) as string[];
                    return `Mandá exactamente uno de: ${group.join(', ')}`;
                },
            },
        });
    };
}

export class CreateIntentDto {
    @ApiPropertyOptional({
        description: 'ID del curso a comprar. Excluyente con planId.',
        example: '8a01e21a-a392-4e93-bf76-8d1f4a4ef650',
    })
    @IsOptional()
    @IsUUID()
    courseId?: string;

    @ApiPropertyOptional({
        enum: SubscriptionPlan,
        description: 'Plan de suscripción a contratar. Excluyente con courseId.',
        example: SubscriptionPlan.PREMIUM,
    })
    @IsOptional()
    @IsEnum(SubscriptionPlan)
    planId?: SubscriptionPlan;

    // Propiedad ancla del validador de objeto. No transporta datos: solo existe
    // para que "exactamente uno de courseId/planId" corra siempre, incluso con
    // body `{}`.
    @ExactlyOneOf(['courseId', 'planId'])
    private readonly _oneOf?: never;
}
