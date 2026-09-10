import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { CourseModule } from '../../course-modules/entities/course-module.entity';
import { CourseEnrollment } from '../../course-enrollments/entities/course-enrollment.entity';

export enum CourseDifficulty {
    BEGINNER = 'beginner',
    INTERMEDIATE = 'intermediate',
    ADVANCED = 'advanced',
}

@Entity('courses')
export class Course {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    // Identificador legible para URLs (/cursos/:slug). El front lo usa para
    // resolver qué curso es antes de pedir el detalle por id. Se deriva del
    // título al crear el curso; ver CoursesService.create.
    @Column({ unique: true })
    slug: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'enum', enum: CourseDifficulty, default: CourseDifficulty.BEGINNER })
    difficulty: CourseDifficulty;

    @Column({ name: 'image_url', nullable: true })
    imageUrl: string;

    // Precio en la unidad mínima de la moneda (centavos para usd). 0 = curso
    // gratis: no pasa por Stripe, se puede inscribir directo. > 0 obliga a
    // pagar vía POST /payments/create-intent y la inscripción la crea el
    // webhook, nunca POST /course-enrollments.
    @Column({ name: 'price_in_cents', type: 'int', default: 0 })
    priceInCents: number;

    @Column({ type: 'varchar', length: 3, default: 'usd' })
    currency: string;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => User, (user) => user.coursesCreated, { onDelete: 'CASCADE' })
    instructor: User;

    @ManyToOne(() => Category, (category) => category.courses, { nullable: true, onDelete: 'SET NULL' })
    category: Category;

    @OneToMany(() => CourseModule, (module) => module.course)
    modules: CourseModule[];

    @OneToMany(() => CourseEnrollment, (enrollment) => enrollment.course)
    enrollments: CourseEnrollment[];

    @CreateDateColumn()
    createdAt: Date;
}