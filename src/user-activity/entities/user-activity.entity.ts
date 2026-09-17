import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * UN registro por (usuario, día con actividad). Nada más.
 *
 * La racha NO se guarda como contador. Un contador que se incrementa se
 * desincroniza al primer bug, al primer reintento o al primer borrado, y no hay
 * forma de recalcularlo porque el dato original ya no está. Acá el dato original
 * SON las filas: la racha se deriva de ellas cuando se pide, y cualquier cambio
 * de regla (¿vale el domingo?, ¿cuenta media noche UTC?) se aplica retroactivo
 * sin migrar nada.
 */
@Entity('user_activity')
/* El único compuesto hace dos cosas a la vez:
   - vuelve idempotente al listener (aunque el evento llegue diez veces el mismo
     día, la fila sigue siendo una sola);
   - Postgres lo respalda con un índice sobre (user_id, date), que es
     exactamente la lectura de la racha ("los días de un usuario, del más nuevo
     al más viejo"). Por eso no se agrega un @Index aparte: sería el mismo
     índice dos veces, con el doble de costo de escritura. */
@Unique('UQ_user_activity_user_date', ['userId', 'date'])
export class UserActivity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    /**
     * Fecha sola, sin hora. `date` de Postgres, y el driver la devuelve como
     * string 'YYYY-MM-DD' — se deja así a propósito: comparar días como string
     * ISO no arrastra husos horarios ni horarios de verano.
     */
    @Column({ type: 'date' })
    date: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}
