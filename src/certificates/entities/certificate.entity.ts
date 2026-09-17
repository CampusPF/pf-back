import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Course } from '../../courses/entities/course.entity';

/** Un registro por certificado emitido. */
@Entity('certificate')
// No se puede emitir dos veces para el mismo curso.
@Unique('UQ_certificate_user_course', ['userId', 'courseId'])
export class Certificate {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'course_id', type: 'uuid' })
    courseId: string;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'course_id' })
    course: Course;

    /** Código corto de verificación pública, ej "CMP-8F3K2A". */
    @Column({ type: 'varchar', length: 20, unique: true })
    code: string;

    @Column({ name: 'pdf_url', type: 'varchar', length: 500 })
    pdfUrl: string;

    @CreateDateColumn({ name: 'issued_at', type: 'timestamptz' })
    issuedAt: Date;
}
