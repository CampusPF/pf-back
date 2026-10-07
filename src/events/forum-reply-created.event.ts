/**
 * Alguien respondió en un hilo. `recipientIds` son los que ya participaban
 * (autor del hilo y quienes respondieron antes), sin deduplicar contra el
 * que responde: el listener filtra al actor.
 */
export class ForumReplyCreatedEvent {
  constructor(
    public readonly threadId: string,
    public readonly threadTitle: string,
    public readonly postId: string,
    public readonly actorId: string,
    public readonly recipientIds: string[],
  ) { }
}
