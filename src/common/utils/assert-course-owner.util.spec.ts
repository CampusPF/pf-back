import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';
import {
    assertCanRemoveCourse,
    assertCanRestoreCourse,
    assertCourseOwner,
} from './assert-course-owner.util';

/**
 * Reglas puras, sin base: quién puede escribir/eliminar/restaurar un curso.
 * Lo que importa blindar acá es la regla nueva — un TEACHER no puede tocar
 * (ni editar, ni reactivar) un curso que un ADMIN desactivó.
 */
describe('assert-course-owner.util', () => {
    const OWNER_ID = 'teacher-1';
    const OTHER_TEACHER = { id: 'teacher-2', role: UserRole.TEACHER };
    const OWNER = { id: OWNER_ID, role: UserRole.TEACHER };
    const ADMIN = { id: 'admin-1', role: UserRole.ADMIN };
    const STUDENT = { id: 'student-1', role: UserRole.STUDENT };

    const activeCourse = { instructor: { id: OWNER_ID }, isActive: true, deactivatedByAdmin: false };
    const selfPausedCourse = { instructor: { id: OWNER_ID }, isActive: false, deactivatedByAdmin: false };
    const adminBlockedCourse = { instructor: { id: OWNER_ID }, isActive: false, deactivatedByAdmin: true };

    describe('assertCourseOwner (escribir contenido)', () => {
        it('el dueño puede editar su curso activo', () => {
            expect(() => assertCourseOwner(activeCourse, OWNER)).not.toThrow();
        });

        it('el dueño puede editar un curso que ÉL MISMO pausó', () => {
            expect(() => assertCourseOwner(selfPausedCourse, OWNER)).not.toThrow();
        });

        it('el dueño NO puede editar un curso que bajó un ADMIN', () => {
            expect(() => assertCourseOwner(adminBlockedCourse, OWNER)).toThrow(ForbiddenException);
        });

        it('el ADMIN nunca edita contenido, ni siquiera de un curso que él mismo bajó', () => {
            expect(() => assertCourseOwner(adminBlockedCourse, ADMIN)).toThrow(ForbiddenException);
        });

        it('otro docente no puede editar un curso ajeno', () => {
            expect(() => assertCourseOwner(activeCourse, OTHER_TEACHER)).toThrow(ForbiddenException);
        });

        it('un alumno no puede editar ningún curso', () => {
            expect(() => assertCourseOwner(activeCourse, STUDENT)).toThrow(ForbiddenException);
        });

        it('sin isActive/deactivatedByAdmin en el objeto (undefined), no bloquea de más', () => {
            // Contrato documentado en OwnableCourse: si la query no trajo estas
            // columnas, el chequeo extra no debe activarse solo.
            expect(() => assertCourseOwner({ instructor: { id: OWNER_ID } }, OWNER)).not.toThrow();
        });
    });

    describe('assertCanRemoveCourse (eliminar)', () => {
        it('el dueño puede eliminar, esté como esté (activo o ya pausado)', () => {
            expect(() => assertCanRemoveCourse(activeCourse, OWNER)).not.toThrow();
            expect(() => assertCanRemoveCourse(adminBlockedCourse, OWNER)).not.toThrow();
        });

        it('el ADMIN siempre puede eliminar', () => {
            expect(() => assertCanRemoveCourse(activeCourse, ADMIN)).not.toThrow();
        });

        it('otro docente no puede eliminar un curso ajeno', () => {
            expect(() => assertCanRemoveCourse(activeCourse, OTHER_TEACHER)).toThrow(ForbiddenException);
        });
    });

    describe('assertCanRestoreCourse (restaurar)', () => {
        it('el dueño puede restaurar lo que ÉL MISMO desactivó', () => {
            expect(() => assertCanRestoreCourse(selfPausedCourse, OWNER)).not.toThrow();
        });

        it('el dueño NO puede restaurar lo que desactivó un ADMIN', () => {
            expect(() => assertCanRestoreCourse(adminBlockedCourse, OWNER)).toThrow(ForbiddenException);
        });

        it('el ADMIN siempre puede restaurar, lo haya bajado quien lo haya bajado', () => {
            expect(() => assertCanRestoreCourse(selfPausedCourse, ADMIN)).not.toThrow();
            expect(() => assertCanRestoreCourse(adminBlockedCourse, ADMIN)).not.toThrow();
        });

        it('otro docente no puede restaurar un curso ajeno', () => {
            expect(() => assertCanRestoreCourse(selfPausedCourse, OTHER_TEACHER)).toThrow(ForbiddenException);
        });
    });
});
