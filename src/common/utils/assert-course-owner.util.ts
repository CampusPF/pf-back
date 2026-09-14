import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

/** Lo mínimo que hace falta del curso para decidir titularidad. */
export interface OwnableCourse {
    instructor?: { id: string } | null;
}

export interface Actor {
    id: string;
    role: UserRole;
}

/**
 * Compartido por cursos, módulos, lecciones y sus adjuntos: un TEACHER sólo
 * puede escribir sobre SU curso (o lo que cuelgue de él); ADMIN siempre puede.
 *
 * El mensaje va en español y sin detalles internos a propósito — es el mismo
 * texto que termina mostrándose tal cual en el front (ver adminErrorMessage
 * en pf-front), a diferencia del `ForbiddenException()` sin argumentos que
 * usa RolesGuard, cuyo "Forbidden resource" es el mensaje default de Nest.
 */
export function assertCourseOwner(course: OwnableCourse, actor: Actor): void {
    if (actor.role === UserRole.ADMIN) return;
    if (course.instructor?.id === actor.id) return;

    throw new ForbiddenException('Este curso no es tuyo: no podés editarlo.');
}
