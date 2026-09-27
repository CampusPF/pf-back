import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    AiProvider,
    AiProviderError,
    AiStreamRequest,
    AI_MAX_OUTPUT_TOKENS,
} from './ai-provider.interface';
import { readSseData } from './sse-reader';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Proveedor principal: Google Gemini vía REST (sin SDK, con fetch nativo).
 * Doc: https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
 */
@Injectable()
export class GeminiProvider implements AiProvider {
    readonly name = 'gemini';
    private readonly apiKey?: string;
    private readonly model: string;

    constructor(config: ConfigService) {
        this.apiKey = config.get<string>('GEMINI_API_KEY');
        this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    async *streamReply({ systemPrompt, history, signal }: AiStreamRequest): AsyncIterable<string> {
        const response = await fetch(
            `${GEMINI_BASE_URL}/${this.model}:streamGenerateContent?alt=sse`,
            {
                method: 'POST',
                signal,
                headers: {
                    'Content-Type': 'application/json',
                    // Header y no query param: así la key no queda en logs de URLs.
                    'x-goog-api-key': this.apiKey ?? '',
                },
                body: JSON.stringify({
                    // Las reglas del tutor van en systemInstruction, separadas
                    // del input del alumno.
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    // Gemini llama 'model' a lo que el resto llama 'assistant'.
                    contents: history.map((m) => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }],
                    })),
                    generationConfig: {
                        maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
                        temperature: 0.6,
                        // Sin thinkingConfig a propósito: el modelo "lite" no
                        // razona por defecto (1er token en ~1,5 s). Los "flash"
                        // 3.x ignoran thinkingBudget:0 y tardaban 10-30 s.
                    },
                }),
            },
        );

        if (!response.ok || !response.body) {
            const detail = await response.text().catch(() => '');
            throw new AiProviderError(this.name, `HTTP ${response.status}: ${detail.slice(0, 300)}`, response.status);
        }

        for await (const data of readSseData(response.body)) {
            const chunk = JSON.parse(data);
            const parts: { text?: string; thought?: boolean }[] =
                chunk.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
                if (part.text && !part.thought) yield part.text;
            }
        }
    }
}
