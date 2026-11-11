/**
 * Se guardó un mensaje del chat directo.
 *
 * Lo escucha Golondrina: si quien escribe es el docente del curso y el alumno
 * activó «avisame si responde» en una lección de ese curso, le llega el aviso.
 */
export class ChatMessageSentEvent {
    constructor(
        public readonly messageId: string,
        public readonly senderId: string,
        public readonly receiverId: string,
    ) { }
}
