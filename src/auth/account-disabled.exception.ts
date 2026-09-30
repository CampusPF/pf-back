import { ForbiddenException } from '@nestjs/common';

/**
 * Mensaje ÚNICO para una cuenta dada de baja (o suspendida), en todos los
 * caminos: login con contraseña, Google, registro y cualquier request con una
 * sesión que ya estaba abierta.
 *
 * Antes cada camino respondía otra cosa: el login decía "no existe una cuenta
 * con este email" y el registro "ya existe una cuenta con este email". La
 * persona recibía dos respuestas contradictorias y nunca se enteraba de que
 * la habían dado de baja.
 */
export const ACCOUNT_DISABLED_MESSAGE =
  'Tu cuenta fue dada de baja. Si creés que es un error, escribinos desde la página de Contacto.';

/** Código estable para que el front lo reconozca sin depender del texto. */
export const ACCOUNT_DISABLED_CODE = 'account_disabled';

/**
 * 403 (no 401): la identidad es válida pero la cuenta no puede usar la app.
 * Lleva `code` en el cuerpo para que el front muestre el aviso con un link a
 * Contacto (y cierre la sesión si ya estaba abierta) en lugar de un error
 * genérico. En el callback de Google se mapea a `?error=account_disabled`.
 */
export class AccountDisabledException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      error: 'Forbidden',
      code: ACCOUNT_DISABLED_CODE,
      message: ACCOUNT_DISABLED_MESSAGE,
    });
  }
}
