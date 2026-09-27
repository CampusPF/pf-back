import { ConfigService } from '@nestjs/config';
import { FailoverAiProvider } from './failover-ai.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';

/** Arma una Response de fetch con un body SSE, partido en chunks arbitrarios. */
function sseResponse(chunks: string[], status = 200): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
            controller.close();
        },
    });
    return new Response(body, { status });
}

async function collect(iterable: AsyncIterable<string>): Promise<string> {
    let out = '';
    for await (const t of iterable) out += t;
    return out;
}

const request = { systemPrompt: 'reglas', history: [{ role: 'user' as const, content: 'hola' }] };

describe('Proveedores de IA', () => {
    const fetchMock = jest.fn();
    const config = (env: Record<string, string>) => new ConfigService(env);

    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('Gemini: junta el texto aunque un evento llegue partido en dos chunks', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"Hola "}]}}]}\n\ndata: {"candi',
            'dates":[{"content":{"parts":[{"text":"alumno"}]}}]}\n\n',
        ]));
        const gemini = new GeminiProvider(config({ GEMINI_API_KEY: 'k' }));

        await expect(collect(gemini.streamReply(request))).resolves.toBe('Hola alumno');

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain(':streamGenerateContent?alt=sse');
        const body = JSON.parse(init.body);
        // Las reglas van separadas del mensaje del alumno.
        expect(body.systemInstruction.parts[0].text).toBe('reglas');
        expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hola' }] }]);
        expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(0);
    });

    it('Groq: lee deltas estilo OpenAI y corta en [DONE]', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"content":"Uno "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"dos"}}]}\n\ndata: [DONE]\n\n',
        ]));
        const groq = new GroqProvider(config({ GROQ_API_KEY: 'k' }));

        await expect(collect(groq.streamReply(request))).resolves.toBe('Uno dos');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0]).toEqual({ role: 'system', content: 'reglas' });
    });

    it('failover: si Gemini falla antes de responder, contesta Groq', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }))
            .mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"respaldo"}}]}\n\n']));
        const env = config({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' });
        const failover = new FailoverAiProvider(env, new GeminiProvider(env), new GroqProvider(env));

        await expect(collect(failover.streamReply(request))).resolves.toBe('respaldo');
        expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage');
        expect(fetchMock.mock.calls[1][0]).toContain('groq');
    });

    it('failover: AI_PROVIDER=groq invierte el orden', async () => {
        fetchMock.mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']));
        const env = config({ AI_PROVIDER: 'groq', GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' });
        const failover = new FailoverAiProvider(env, new GeminiProvider(env), new GroqProvider(env));

        await collect(failover.streamReply(request));
        expect(fetchMock.mock.calls[0][0]).toContain('groq');
    });

    it('failover: saltea proveedores sin key y queda sin configurar si no hay ninguna', () => {
        const env = config({});
        const failover = new FailoverAiProvider(env, new GeminiProvider(env), new GroqProvider(env));
        expect(failover.isConfigured()).toBe(false);
    });
});
