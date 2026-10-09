/**
 * Alguien editó una respuesta de un hilo. `recipientIds` son los que ya
 * participaban (autor del hilo y quienes respondieron), igual que en
 * ForumReplyCreatedEvent; el listener filtra a quien editó.
 */
export class ForumPostUpdatedEvent {
  constructor(
    public readonly threadId: string,
    public readonly threadTitle: string,
    public readonly postId: string,
    public readonly actorId: string,
    public readonly recipientIds: string[],
  ) { }
}
