import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';

export function IsAdult(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'isAdult',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: string) {
                    if (!value) return false;

                    const birthDate = new Date(value);
                    const today = new Date();

                    let age = today.getFullYear() - birthDate.getFullYear();

                    const monthDifference =
                        today.getMonth() - birthDate.getMonth();

                    if (
                        monthDifference < 0 ||
                        (monthDifference === 0 &&
                            today.getDate() < birthDate.getDate())
                    ) {
                        age--;
                    }

                    return age >= 18;
                },

                defaultMessage() {
                    return 'El usuario debe ser mayor de edad (18 años o más)';
                },
            },
        });
    };
}