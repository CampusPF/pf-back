export interface AiChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface AiStreamRequest {
    /** Reglas + contexto de la lección. Lo arma SIEMPRE el servidor. */
    systemPrompt: string;
    /** Historial en orden cronológico; el último es el mensaje del alumno. */
    history: AiChatMessage[];
    /** Se aborta cuando el alumno cierra la conexión: deja de gastar tokens. */
    signal?: AbortSignal;
}

export interface AiProvider {
    readonly name: string;

    /** false si falta la API key: el failover lo saltea. */
    isConfigured(): boolean;

    /**
     * Devuelve la respuesta del modelo en pedacitos de texto, a medida que
     * llegan (streaming).
     *
     * Contrato de seguridad que TODA implementación debe respetar:
     *
     * 1. El texto del alumno viaja siempre como mensaje con role:'user'.
     *    Nunca se concatena dentro del system prompt: si se concatenara,
     *    un "ignorá las instrucciones anteriores" del alumno quedaría al
     *    mismo nivel que las reglas del tutor (prompt injection).
     * 2. Se manda SIEMPRE un límite de tokens de salida (control de costo).
     * 3. La API key sale de env y jamás se loguea ni se devuelve al front.
     */
    streamReply(request: AiStreamRequest): AsyncIterable<string>;
}

export const AI_PROVIDER = 'AI_PROVIDER';

/** Tope de tokens de la respuesta del modelo. Control de costo y de abuso. */
export const AI_MAX_OUTPUT_TOKENS = 1000;

/** Error del proveedor (HTTP != 2xx, cuota agotada, red caída...). */
export class AiProviderError extends Error {
    constructor(
        readonly provider: string,
        message: string,
        readonly status?: number,
    ) {
        super(`[${provider}] ${message}`);
    }
}
