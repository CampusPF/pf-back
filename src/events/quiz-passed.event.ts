/**
 * El alumno aprobó un checkpoint / quiz.
 *
 * Todavía NADIE la emite: el módulo de checkpoints no existe. Está definida de
 * antemano para fijar el contrato ahora y que XP/logros puedan escucharla sin
 * renegociar la forma del evento.
 */
export class QuizPassedEvent {
  constructor(
    public readonly userId: string,
    public readonly quizId: string,
    public readonly courseId: string,
    public readonly score: number,
  ) { }
}
