/**
 * El alumno llegó al 100% de un curso.
 *
 * Se emite en la transición a 100%, no cada vez que se toca una lección de un
 * curso ya terminado.
 */
export class CourseCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly courseId: string,
  ) { }
}
