/**
 * El alumno completó una lección por PRIMERA vez.
 *
 * Se emite una sola vez por (usuario, lección): quien lo escuche puede sumar
 * sin chequear duplicados. Si la lección se desmarca y se vuelve a marcar,
 * vuelve a emitirse — es una completitud nueva.
 */
export class LessonCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly lessonId: string,
    public readonly courseId: string,
  ) { }
}
