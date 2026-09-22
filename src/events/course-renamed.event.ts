/**
 * Se cambió el título de un curso.
 *
 * Lo escuchan los certificados: el PDF lleva el nombre del curso impreso, y
 * sin este aviso los ya emitidos seguirían mostrando el nombre viejo.
 */
export class CourseRenamedEvent {
    constructor(public readonly courseId: string) { }
}
