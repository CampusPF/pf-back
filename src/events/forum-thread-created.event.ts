/**
 * Se abrió un hilo, de curso o del foro general.
 *
 * `courseId`/`courseTitle`: en un hilo de curso, el id y título del curso.
 * En un hilo del foro general (sin curso) llevan el id y nombre de la
 * CATEGORÍA en su lugar — el nombre del campo quedó del caso original, pero
 * el listener sólo usa `courseTitle` para armar el texto del aviso ("Nuevo
 * hilo en {lo que sea}"), así que sirve igual para los dos casos.
 *
 * `recipientIds`:
 *  - hilo de curso: docente + todos los alumnos con inscripción activa al
 *    curso (puede incluir a quien lo abrió; el listener lo filtra).
 *  - hilo del foro general: todo el staff (admin + docentes) de la
 *    plataforma — no hay un curso con inscriptos a quién avisar.
 */
export class ForumThreadCreatedEvent {
  constructor(
    public readonly threadId: string,
    public readonly threadTitle: string,
    public readonly courseId: string,
    public readonly courseTitle: string,
    public readonly recipientIds: string[],
    public readonly actorId: string,
  ) { }
}
