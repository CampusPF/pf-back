import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Multiple choice de respuesta única: de las opciones de una pregunta, una y
 * sólo una tiene que ser la correcta. Con cero no se puede aprobar nunca; con
 * dos, la corrección dependería de cuál se tome como "la" correcta.
 */
export function ExactlyOneCorrect(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'exactlyOneCorrect',
            target: object.constructor,
            propertyName,
            options: {
                message: 'Cada pregunta tiene que tener exactamente una opción correcta',
                ...validationOptions,
            },
            validator: {
                validate(value: unknown) {
                    if (!Array.isArray(value)) return false;
                    return value.filter((option) => option?.isCorrect === true).length === 1;
                },
            },
        });
    };
}
