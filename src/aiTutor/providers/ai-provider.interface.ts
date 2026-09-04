export interface AiChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface AiProvider {
    /**
     * Recibe el historial completo de la conversación (orden cronológico)
     * y devuelve la respuesta del asistente como texto plano.
     */
    generateReply(history: AiChatMessage[], lessonContext?: string): Promise<string>;
}

export const AI_PROVIDER = 'AI_PROVIDER';