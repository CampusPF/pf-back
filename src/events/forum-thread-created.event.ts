/**
 * Se abrió un hilo en el foro de un curso. Sólo se emite para hilos de curso:
 * los del foro general no notifican a nadie.
 */
export class ForumThreadCreatedEvent {
  constructor(
    public readonly threadId: string,
    public readonly threadTitle: string,
    public readonly courseId: string,
    public readonly courseTitle: string,
    public readonly instructorId: string | null,
    public readonly actorId: string,
  ) { }
}
