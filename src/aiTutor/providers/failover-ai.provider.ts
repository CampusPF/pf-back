import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiStreamRequest } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';

/**
 * Es el AiProvider que usa el resto de la app. Por dentro prueba los
 * proveedores reales en orden:
 *
 *   AI_PROVIDER=gemini (default) → Gemini primero, Groq de respaldo
 *   AI_PROVIDER=groq             → Groq primero, Gemini de respaldo
 *
 * Si el primero falla ANTES de mandar texto (cuota agotada, 5xx, red), se pasa
 * al siguiente y el alumno no se entera. Si falla a mitad de una respuesta ya
 * no se puede cambiar (el alumno ya vio medio texto), así que se propaga.
 */
@Injectable()
export class FailoverAiProvider implements AiProvider {
    readonly name = 'failover';
    private readonly logger = new Logger(FailoverAiProvider.name);
    private readonly chain: AiProvider[];

    constructor(config: ConfigService, gemini: GeminiProvider, groq: GroqProvider) {
        const preferred = config.get<string>('AI_PROVIDER') ?? 'gemini';
        const ordered = preferred === 'groq' ? [groq, gemini] : [gemini, groq];
        this.chain = ordered.filter((p) => p.isConfigured());

        if (this.chain.length === 0) {
            this.logger.warn('No hay GEMINI_API_KEY ni GROQ_API_KEY: el tutor IA va a responder 503.');
        } else {
            this.logger.log(`Tutor IA: ${this.chain.map((p) => p.name).join(' → ')}`);
        }
    }

    isConfigured(): boolean {
        return this.chain.length > 0;
    }

    async *streamReply(request: AiStreamRequest): AsyncIterable<string> {
        if (this.chain.length === 0) {
            throw new ServiceUnavailableException('El tutor IA no está configurado');
        }

        let lastError: unknown;
        for (const provider of this.chain) {
            let emittedText = false;
            try {
                for await (const text of provider.streamReply(request)) {
                    emittedText = true;
                    yield text;
                }
                return;
            } catch (error) {
                if (emittedText || request.signal?.aborted) throw error;
                lastError = error;
                this.logger.warn(`Falló ${provider.name}, probando el siguiente: ${(error as Error).message}`);
            }
        }
        throw lastError;
    }
}
