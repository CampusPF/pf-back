import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    AiProvider,
    AiProviderError,
    AiStreamRequest,
    AI_MAX_OUTPUT_TOKENS,
} from './ai-provider.interface';
import { readSseData } from './sse-reader';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Proveedor de respaldo: Groq (modelos Llama). Su API es compatible con la de
 * OpenAI, así que el formato es el clásico messages[] con role 'system'.
 * Doc: https://console.groq.com/docs/api-reference#chat-create
 */
@Injectable()
export class GroqProvider implements AiProvider {
    readonly name = 'groq';
    private readonly apiKey?: string;
    private readonly model: string;

    constructor(config: ConfigService) {
        this.apiKey = config.get<string>('GROQ_API_KEY');
        this.model = config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-120b';
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    async *streamReply({ systemPrompt, history, signal }: AiStreamRequest): AsyncIterable<string> {
        const response = await fetch(GROQ_URL, {
            method: 'POST',
            signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey ?? ''}`,
            },
            body: JSON.stringify({
                model: this.model,
                stream: true,
                max_tokens: AI_MAX_OUTPUT_TOKENS,
                temperature: 0.6,
                // gpt-oss razona antes de responder: poco (más rápido y
                // barato) y sin mandarlo en el stream (sólo queremos la respuesta).
                reasoning_effort: 'low',
                include_reasoning: false,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history.map((m) => ({ role: m.role, content: m.content })),
                ],
            }),
        });

        if (!response.ok || !response.body) {
            const detail = await response.text().catch(() => '');
            throw new AiProviderError(this.name, `HTTP ${response.status}: ${detail.slice(0, 300)}`, response.status);
        }

        for await (const data of readSseData(response.body)) {
            if (data === '[DONE]') return;
            const text = JSON.parse(data).choices?.[0]?.delta?.content;
            if (text) yield text;
        }
    }
}
