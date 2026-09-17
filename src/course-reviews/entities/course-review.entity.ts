import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Unique,
    Index,
    Check,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Course } from '../../courses/entities/course.entity';

/**
 * Reseña de un curso: puntaje de 1 a 5 y un comentario opcional.
 *
 * El promedio y la cantidad de reseñas NO se guardan en `courses`. Se calculan
 * con un AVG/COUNT agrupado (ver CourseStatsService), por la misma razón por la
 * que la racha no es un contador: un valor derivado guardado aparte se
 * desincroniza al primer borrado o edición que no lo recalcule.
 */
@Entity('course_reviews')
/* Una reseña por alumno por curso: volver a reseñar la edita, no la duplica.
   El índice que respalda el único arranca por user_id, que es la lectura de
   "mi reseña de este curso". */
@Unique('UQ_course_reviews_user_course', ['userId', 'courseId'])
/* La lectura pública es "las reseñas de un curso, de la más nueva a la más
   vieja" — y también es el filtro de los agregados por curso. */
@Index('IDX_course_reviews_course_created', ['courseId', 'createdAt'])
/* La validación del DTO no alcanza: cualquier escritura que no pase por la API
   (seed, script, SQL a mano) rompería el promedio con un 0 o un 10. */
@Check('CHK_course_reviews_rating', '"rating" BETWEEN 1 AND 5')
export class CourseReview {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @Column({ name: 'course_id', type: 'uuid' })
    courseId: string;

    @Column({ type: 'smallint' })
    rating: number;

    /** `null` = sólo puntaje. Nunca string vacío (lo normaliza el service). */
    @Column({ type: 'text', nullable: true })
    comment: string | null;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'course_id' })
    course: Course;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
