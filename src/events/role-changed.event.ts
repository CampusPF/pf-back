import { UserRole } from '../users/entities/user.entity';

/**
 * Se cambió el rol de un usuario (student / teacher / admin).
 *
 * Lo escucha EmailNotificationsListener para avisarle al usuario que sus
 * permisos cambiaron. Es informativo: el usuario no tiene que hacer nada,
 * pero se entera de que ya no es lo que era.
 */

export class RoleChangedEvent {
    constructor(
        public readonly userId: string,
        public readonly previousRole: UserRole,
        public readonly newRole: UserRole,
    ) { }
}
