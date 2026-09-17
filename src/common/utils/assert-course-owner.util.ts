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

/*
 * Los mensajes van en español y sin detalles internos a propósito — son el
 * mismo texto que termina mostrándose tal cual en el front (ver
 * adminErrorMessage en pf-front), a diferencia del `ForbiddenException()` sin
 * argumentos que usa RolesGuard, cuyo "Forbidden resource" es el mensaje
 * default de Nest.
 */

/**
 * ESCRIBIR un curso o lo que cuelga de él (datos, precio, portada, módulos,
 * lecciones, adjuntos): sólo su instructor.
 *
 * El ADMIN no edita contenido: puede eliminar o restaurar un curso entero (ver
 * assertCanRemoveCourse), pero qué dice el curso, cuánto cuesta y cómo está
 * armado es responsabilidad de quien lo dicta. Los controllers ya lo dejan
 * afuera con @Roles(TEACHER); esto es la segunda barrera y el chequeo de
 * titularidad.
 */
export function assertCourseOwner(course: OwnableCourse, actor: Actor): void {
    if (actor.role === UserRole.TEACHER && course.instructor?.id === actor.id) return;

    if (actor.role === UserRole.ADMIN) {
        throw new ForbiddenException(
            'Los administradores no pueden editar cursos: sólo eliminarlos o restaurarlos.',
        );
    }
    throw new ForbiddenException('Este curso no es tuyo: no podés editarlo.');
}

/** Eliminar (borrado lógico) o restaurar un curso entero: su instructor o un ADMIN. */
export function assertCanRemoveCourse(course: OwnableCourse, actor: Actor): void {
    if (actor.role === UserRole.ADMIN) return;
    if (actor.role === UserRole.TEACHER && course.instructor?.id === actor.id) return;

    throw new ForbiddenException('Este curso no es tuyo: no podés eliminarlo.');
}
