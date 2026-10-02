import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechService, stripPromptEcho } from './speech.service';

function makeService(env: Record<string, string | undefined> = { GROQ_API_KEY: 'gsk_test' }) {
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    return new SpeechService(config);
}

const AUDIO = { buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), mimetype: 'audio/webm;codecs=opus' };

function mockFetch(status: number, body: unknown) {
    return jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
}

describe('SpeechService.cleanTranscript', () => {
    const service = makeService();

    it('une los segmentos con voz y descarta los que son silencio', () => {
        expect(
            service.cleanTranscript({
                text: 'ignorado',
                segments: [
                    { text: ' ¿Qué es un repositorio', no_speech_prob: 0.01 },
                    { text: ' en TypeORM?', no_speech_prob: 0.1 },
                    { text: ' Gracias por ver el video.', no_speech_prob: 0.9 },
                ],
            }),
        ).toBe('¿Qué es un repositorio en TypeORM?');
    });

    /* Con silencio, Whisper no devuelve vacío: inventa una frase de
       subtítulos. Que no termine pegada en el campo del alumno. */
    it.each([
        'Subtítulos realizados por la comunidad de Amara.org',
        '¡Gracias por ver el video!',
        'Suscríbete',
    ])('una alucinación conocida sola ("%s") da vacío', (hallucination) => {
        expect(service.cleanTranscript({ text: hallucination })).toBe('');
    });

    it('"Gracias" dicho de verdad NO se descarta (en el chat es un mensaje válido)', () => {
        expect(service.cleanTranscript({ segments: [{ text: 'Gracias', no_speech_prob: 0.05 }] })).toBe(
            'Gracias',
        );
    });

    it('sin segmentos usa `text`', () => {
        expect(service.cleanTranscript({ text: '  hola   profe ' })).toBe('hola profe');
    });
});

/* Whisper a veces arranca copiando el prompt. Pasó de verdad probando con
   auriculares: se dictó "Hola, ¿cómo estás?" y llegó
   "JavaScript, R.D.P.: Hola, ¿cómo estás?". */
describe('stripPromptEcho', () => {
    const vocabulary = ['JavaScript', 'TypeScript', 'React', 'NestJS', 'TypeORM', 'PostgreSQL'];
    const strip = (text: string) => stripPromptEcho(text, vocabulary);

    it('saca el caso real: término + sigla deformada', () => {
        expect(strip('JavaScript, R.D.P.: Hola, ¿cómo estás?')).toBe('Hola, ¿cómo estás?');
    });

    it('saca varios términos seguidos', () => {
        expect(strip('JavaScript, TypeScript, React: ¿qué es un hook?')).toBe('¿qué es un hook?');
    });

    it('no toca una transcripción normal', () => {
        expect(strip('Hola profe, ¿cómo estás?')).toBe('Hola profe, ¿cómo estás?');
        expect(strip('No entiendo la diferencia entre find y findOne.')).toBe(
            'No entiendo la diferencia entre find y findOne.',
        );
    });

    /* Lo importante: no comerse lo que alguien dijo de verdad. Si la frase
       EMPIEZA con un término pero sigue con lenguaje real, se conserva. */
    it('respeta una frase que empieza con un término pero no es eco', () => {
        expect(strip('TypeScript, ¿me lo explicás de nuevo?')).toBe('TypeScript, ¿me lo explicás de nuevo?');
        expect(strip('React, Angular y Vue, ¿cuál conviene?')).toBe('React, Angular y Vue, ¿cuál conviene?');
    });

    it('nunca devuelve vacío', () => {
        expect(strip('JavaScript, TypeScript')).toBe('JavaScript, TypeScript');
    });
});

describe('SpeechService.transcribe', () => {
    afterEach(() => jest.restoreAllMocks());

    it('sin GROQ_API_KEY → 503 y no llama a Groq', async () => {
        const fetchSpy = jest.spyOn(globalThis, 'fetch');
        const service = makeService({});
        expect(service.isConfigured()).toBe(false);
        await expect(service.transcribe(AUDIO)).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('manda modelo, idioma, verbose_json, el contexto y un nombre de archivo con extensión', async () => {
        const fetchSpy = mockFetch(200, { segments: [{ text: 'Hola', no_speech_prob: 0 }] });
        const service = makeService({ GROQ_API_KEY: 'gsk_test' });

        await expect(service.transcribe({ ...AUDIO, context: 'Repositorios' })).resolves.toBe('Hola');

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_test');
        const form = init.body as FormData;
        expect(form.get('model')).toBe('whisper-large-v3-turbo');
        expect(form.get('language')).toBe('es');
        expect(form.get('response_format')).toBe('verbose_json');
        expect(String(form.get('prompt'))).toContain('Repositorios');
        expect((form.get('file') as File).name).toBe('audio.webm');
    });

    it('Safari (audio/mp4) se manda como .m4a', async () => {
        const fetchSpy = mockFetch(200, { text: 'Hola' });
        await makeService().transcribe({ ...AUDIO, mimetype: 'audio/mp4' });
        const form = (fetchSpy.mock.calls[0][1] as RequestInit).body as FormData;
        expect((form.get('file') as File).name).toBe('audio.m4a');
    });

    it('429 de Groq → 429 con mensaje para el usuario', async () => {
        mockFetch(429, 'rate limited');
        const error = await makeService().transcribe(AUDIO).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(429);
    });

    it('otro error de Groq → 503 (no se filtra el detalle al cliente)', async () => {
        mockFetch(500, 'boom interno');
        const error = await makeService().transcribe(AUDIO).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as Error).message).not.toContain('boom');
    });

    it('Groq caído (fetch rechaza) → 503', async () => {
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
        await expect(makeService().transcribe(AUDIO)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});
