/** Una respuesta fue marcada como solución del hilo. */
export class ForumSolutionMarkedEvent {
  constructor(
    public readonly threadId: string,
    public readonly threadTitle: string,
    public readonly postId: string,
    public readonly postAuthorId: string,
    public readonly actorId: string,
  ) { }
}
