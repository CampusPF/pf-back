/**
 * Se creó una cuenta nueva: registro con email/contraseña, registro con
 * Google, o alta hecha por un admin desde el panel (POST /users).
 *
 * `createdByAdmin` distingue el último caso: esa persona no eligió su
 * contraseña, así que el mail de bienvenida le manda un link para definirla.
 */
export class UserRegisteredEvent {
  constructor(
    public readonly userId: string,
    public readonly createdByAdmin: boolean = false,
  ) { }
}
