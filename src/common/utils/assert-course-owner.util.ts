import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

/**
 * Lo mínimo que hace falta del curso para decidir titularidad y bloqueo.
 *
 * `isActive`/`deactivatedByAdmin` son columnas normales de la entidad, así
 * que cualquier `findOne`/query sin un `select` explícito las trae solas —
 * hoy ningún call site de `assertCourseOwner` restringe el select del curso
 * (courses/course-modules/lessons/lesson-resources), así que siempre viajan.
 * Si algún día alguno empieza a pedir sólo algunas columnas, tiene que
 * incluir estas dos: si faltan, acá se leen como `undefined` (falsy) y el
 * bloqueo NO se aplicaría — fail-open, el error que hay que evitar.
 */
export interface OwnableCourse {
    instructor?: { id: string } | null;
    isActive?: boolean;
    deactivatedByAdmin?: boolean;
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

/** Mensaje único para "un admin lo bajó, no podés tocarlo hasta que lo reactive". */
const BLOCKED_BY_ADMIN_MESSAGE =
    'Un administrador desactivó este curso: no podés editarlo ni reactivarlo hasta que un administrador lo restaure.';

/**
 * ESCRIBIR un curso o lo que cuelga de él (datos, precio, portada, módulos,
 * lecciones, adjuntos): sólo su instructor.
 *
 * El ADMIN no edita contenido: puede eliminar o restaurar un curso entero (ver
 * assertCanRemoveCourse/assertCanRestoreCourse), pero qué dice el curso,
 * cuánto cuesta y cómo está armado es responsabilidad de quien lo dicta. Los
 * controllers ya lo dejan afuera con @Roles(TEACHER); esto es la segunda
 * barrera y el chequeo de titularidad.
 *
 * Excepción sobre el propio curso: si un ADMIN lo desactivó (no el propio
 * docente pausándolo), el instructor tampoco puede seguir editando nada de
 * su contenido — módulos, lecciones, adjuntos — mientras siga desactivado.
 * Evita que, si el admin lo bajó por contenido inadecuado, el docente lo siga
 * tocando (o lo reactive él mismo, ver assertCanRestoreCourse) como si nada.
 */
export function assertCourseOwner(course: OwnableCourse, actor: Actor): void {
    if (actor.role === UserRole.TEACHER && course.instructor?.id === actor.id) {
        if (course.isActive === false && course.deactivatedByAdmin) {
            throw new ForbiddenException(BLOCKED_BY_ADMIN_MESSAGE);
        }
        return;
    }

    if (actor.role === UserRole.ADMIN) {
        throw new ForbiddenException(
            'Los administradores no pueden editar cursos: sólo eliminarlos o restaurarlos.',
        );
    }
    throw new ForbiddenException('Este curso no es tuyo: no podés editarlo.');
}

/**
 * Eliminar (borrado lógico) un curso entero: su instructor o un ADMIN.
 * Da igual quién lo desactivó antes — desactivar de nuevo no tiene la
 * restricción que sí tiene restaurar (ver assertCanRestoreCourse).
 */
export function assertCanRemoveCourse(course: OwnableCourse, actor: Actor): void {
    if (actor.role === UserRole.ADMIN) return;
    if (actor.role === UserRole.TEACHER && course.instructor?.id === actor.id) return;

    throw new ForbiddenException('Este curso no es tuyo: no podés eliminarlo.');
}

/**
 * Restaurar un curso desactivado.
 *
 * El ADMIN siempre puede: deshace su propia decisión o la de un colega, y es
 * quien tiene la última palabra sobre qué vuelve al catálogo.
 *
 * El TEACHER dueño puede — salvo que haya sido un ADMIN quien lo desactivó.
 * Si el admin lo bajó (por ejemplo, contenido inadecuado), el docente no
 * puede simplemente reactivarlo por su cuenta: tiene que ser un admin quien
 * decida devolverlo al catálogo.
 */
export function assertCanRestoreCourse(course: OwnableCourse, actor: Actor): void {
    if (actor.role === UserRole.ADMIN) return;

    if (actor.role === UserRole.TEACHER && course.instructor?.id === actor.id) {
        if (course.deactivatedByAdmin) {
            throw new ForbiddenException(BLOCKED_BY_ADMIN_MESSAGE);
        }
        return;
    }

    throw new ForbiddenException('Este curso no es tuyo: no podés restaurarlo.');
}
