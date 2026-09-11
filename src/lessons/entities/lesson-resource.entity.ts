import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';

/**
 * PDF adjunto a una lección (apuntes, ejercicios, slides).
 *
 * A diferencia de las imágenes, acá NO se guarda una URL: el archivo se sube a
 * Cloudinary como `authenticated`, así que la URL pública no sirve el
 * contenido. La URL se firma en el momento de pedirla y vence a los pocos
 * minutos — guardarla en la base sería guardar algo ya vencido.
 */
@Entity('lesson_resources')
export class LessonResource {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Nombre visible en el listado; por defecto el nombre del archivo subido. */
    @Column()
    title: string;

    @Column({ name: 'public_id' })
    publicId: string;

    /** Tamaño que informa Cloudinary, para mostrarlo antes de descargar. */
    @Column({ name: 'size_bytes', type: 'int', default: 0 })
    sizeBytes: number;

    @ManyToOne(() => Lesson, (lesson) => lesson.resources, { onDelete: 'CASCADE' })
    lesson: Lesson;

    @CreateDateColumn()
    createdAt: Date;
}
