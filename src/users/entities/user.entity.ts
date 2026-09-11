import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { CourseEnrollment } from '../../course-enrollments/entities/course-enrollment.entity';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { Course } from '../../courses/entities/course.entity';

export enum UserRole {
    STUDENT = 'student',
    TEACHER = 'teacher',
    ADMIN = 'admin',
}

export enum UserStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    BANNED = 'banned',
    // Baja de cuenta hecha por un admin (borrado lógico). Separado de BANNED
    // a propósito: BANNED implica sanción por incumplir normas, DELETED es
    // simplemente "esta cuenta ya no debe existir/loguearse", sin ese matiz.
    DELETED = 'deleted',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 100 })
    name: string;

    @Column({ unique: true })
    email: string;

    // Doble protección sobre el hash de la contraseña:
    //  - select:false → TypeORM no lo trae de la base salvo que se pida
    //    explícitamente (solo lo hace findByEmail, para el login).
    //  - @Exclude()   → aunque estuviera cargado, no se serializa en la
    //    respuesta HTTP (ClassSerializerInterceptor, global en main.ts).
    @Column({ type: 'varchar', nullable: true, select: false })
    @Exclude()
    passwordHash: string | null;

    @Column({ type: 'varchar', unique: true, nullable: true })
    googleId: string | null;

    // Foto de perfil. Puede venir de dos lados: subida por el usuario a
    // Cloudinary (PATCH /users/me/avatar) o la foto de la cuenta de Google al
    // registrarse. En el segundo caso avatarPublicId queda null, porque el
    // archivo no es nuestro y no hay nada que borrar.
    @Column({ name: 'avatar_url', nullable: true })
    avatarUrl: string;

    @Column({ name: 'avatar_public_id', nullable: true })
    avatarPublicId: string;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.STUDENT })
    role: UserRole;

    @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
    status: UserStatus;

    @Column({ type: 'date', nullable: true })
    birthDate: string;

    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true, length: 200 })
    address: string;

    @Column({ nullable: true, length: 100 })
    city: string;

    @Column({ nullable: true, length: 100 })
    country: string;

    @OneToMany(() => CourseEnrollment, (enrollment) => enrollment.student)
    enrollments: CourseEnrollment[];

    @OneToMany(() => Course, (course) => course.instructor)
    coursesCreated: Course[];

    @OneToMany(() => Subscription, (subscription) => subscription.user)
    subscriptions: Subscription[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}