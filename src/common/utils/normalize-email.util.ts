/**
 * Normaliza un email para que dos formas distintas del mismo email
 * (mayúsculas, espacios) resuelvan siempre al mismo usuario.
 *
 * Se aplica en TODOS los puntos de entrada de un email al sistema:
 * DTOs de auth (vía @Transform), UsersService, y el email que llega
 * de Google (que no pasa por ningún DTO/ValidationPipe).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
