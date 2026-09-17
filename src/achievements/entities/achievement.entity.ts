import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/** Catálogo de logros. Qué usuario desbloqueó cuál vive en user_achievement. */
@Entity('achievement')
export class Achievement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** 'first_lesson', 'streak_7', 'level_5', etc. */
    @Column({ type: 'varchar', length: 50, unique: true })
    code: string;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'text' })
    description: string;

    @Column({ type: 'varchar', length: 100 })
    icon: string;

    /** Ej: { "type": "lessons_completed", "value": 10 }. */
    @Column({ type: 'jsonb' })
    condition: Record<string, unknown>;
}
