/**
 * El alumno aprobó un checkpoint / quiz.
 *
 * La emite QuizzesService.submitAttempt en cada intento aprobado (puede
 * repetirse si el alumno vuelve a aprobar el mismo quiz). La escuchan XP y
 * logros; el XP no se duplica porque su `reason` es único por quiz.
 */
export class QuizPassedEvent {
  constructor(
    public readonly userId: string,
    public readonly quizId: string,
    public readonly courseId: string,
    public readonly score: number,
  ) { }
}
