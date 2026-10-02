import {
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/** Corte de la llamada a Groq: un audio de 60 s tarda ~1 s en transcribirse. */
const TRANSCRIPTION_TIMEOUT_MS = 20_000;

/** Whisper usa los últimos ~224 tokens del prompt: el contexto va recortado. */
const MAX_CONTEXT_CHARS = 200;

/**
 * Un segmento con más probabilidad de "no hay voz" que esto se descarta. Con
 * silencio o ruido, Whisper no devuelve vacío: inventa una frase (ver abajo).
 *
 * OJO: medido en octubre 2026, Groq devuelve `no_speech_prob: 0` incluso para
 * silencio puro, así que hoy este filtro casi no actúa. La barrera real
 * contra el silencio es el front (useVoiceRecorder mide el nivel del
 * micrófono y no manda grabaciones sin voz); esto queda por si Groq empieza
 * a reportarlo bien, junto con la lista de alucinaciones.
 */
const NO_SPEECH_THRESHOLD = 0.6;

/**
 * Vocabulario que Whisper suele escribir mal ("TypeORM" → "tipeo ORM"). Va
 * en el prompt: Whisper lo toma como texto previo y copia la ortografía.
 */
const TECH_VOCABULARY =
    'JavaScript, TypeScript, React, Next.js, NestJS, TypeORM, Node.js, HTML, CSS, API, ' +
    'frontend, backend, PostgreSQL, GitHub, UX/UI';

/**
 * Frases que Whisper "alucina" en español cuando el audio es silencio o
 * ruido: salen de los subtítulos con los que se entrenó. Si la transcripción
 * entera es una de estas, es que no se dijo nada. Se comparan normalizadas
 * (sin tildes, signos ni mayúsculas). "Gracias" o "chau" sueltos NO están:
 * en el chat alguien puede dictar sólo eso de verdad; el silencio real ya lo
 * descarta NO_SPEECH_THRESHOLD.
 */
const KNOWN_HALLUCINATIONS = [
    'subtitulos realizados por la comunidad de amara org',
    'subtitulos por la comunidad de amara org',
    'gracias por ver el video',
    'gracias por ver',
    'gracias por mirar',
    'suscribete',
    'suscribete al canal',
    'musica',
];

interface WhisperSegment {
    text: string;
    no_speech_prob?: number;
}

interface WhisperVerboseResponse {
    text?: string;
    segments?: WhisperSegment[];
}

export interface TranscriptionInput {
    buffer: Buffer;
    mimetype: string;
    /** Título de la lección/curso: ayuda a Whisper con términos técnicos. */
    context?: string;
}

function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9ñ ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Extensión que Groq usa para reconocer el formato del archivo. */
function extensionFor(mimetype: string): string {
    const base = mimetype.split(';')[0].trim().toLowerCase();
    switch (base) {
        case 'audio/ogg':
            return 'ogg';
        case 'audio/mp4':
        case 'audio/x-m4a':
            return 'm4a';
        case 'audio/mpeg':
            return 'mp3';
        case 'audio/wav':
        case 'audio/x-wav':
            return 'wav';
        default:
            return 'webm';
    }
}

/**
 * Speech-to-text con Whisper en Groq (reusa GROQ_API_KEY). El audio se manda
 * y se descarta: no se guarda en ningún lado, ni en disco ni en la base.
 * Doc: https://console.groq.com/docs/speech-to-text
 */
@Injectable()
export class SpeechService {
    private readonly logger = new Logger(SpeechService.name);
    private readonly apiKey?: string;
    private readonly model: string;

    constructor(config: ConfigService) {
        this.apiKey = config.get<string>('GROQ_API_KEY');
        this.model = config.get<string>('SPEECH_MODEL') ?? 'whisper-large-v3-turbo';
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    async transcribe({ buffer, mimetype, context }: TranscriptionInput): Promise<string> {
        if (!this.apiKey) {
            throw new ServiceUnavailableException('El dictado por voz no está disponible en este momento.');
        }

        const form = new FormData();
        form.append(
            'file',
            new Blob([new Uint8Array(buffer)], { type: mimetype }),
            `audio.${extensionFor(mimetype)}`,
        );
        form.append('model', this.model);
        form.append('language', 'es');
        form.append('temperature', '0');
        // verbose_json trae `no_speech_prob` por segmento: es lo que permite
        // descartar el silencio en vez de devolver una frase inventada.
        form.append('response_format', 'verbose_json');
        const prompt = this.buildPrompt(context);
        if (prompt) form.append('prompt', prompt);

        let response: Response;
        try {
            response = await fetch(GROQ_TRANSCRIPTIONS_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}` },
                body: form,
                signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
            });
        } catch (error) {
            this.logger.warn(`Groq no respondió: ${(error as Error).message}`);
            throw new ServiceUnavailableException('No pudimos transcribir el audio. Probá de nuevo.');
        }

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            this.logger.warn(`Groq transcripción HTTP ${response.status}: ${detail.slice(0, 300)}`);
            if (response.status === 429) {
                throw new HttpException(
                    'Hay muchos dictados en curso. Esperá un momento y probá de nuevo.',
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
            throw new ServiceUnavailableException('No pudimos transcribir el audio. Probá de nuevo.');
        }

        const data = (await response.json()) as WhisperVerboseResponse;
        return this.cleanTranscript(data);
    }

    /**
     * Arma el texto final: descarta los segmentos que son silencio y, si lo
     * que queda es sólo una alucinación conocida, devuelve vacío (el front
     * avisa "no te escuché" en vez de pegar una frase que nadie dijo).
     */
    cleanTranscript(data: WhisperVerboseResponse): string {
        const text = data.segments
            ? data.segments
                .filter((segment) => (segment.no_speech_prob ?? 0) < NO_SPEECH_THRESHOLD)
                .map((segment) => segment.text.trim())
                .join(' ')
            : (data.text ?? '');

        const trimmed = text.replace(/\s+/g, ' ').trim();
        if (!trimmed) return '';
        if (KNOWN_HALLUCINATIONS.includes(normalize(trimmed))) return '';
        return trimmed;
    }

    private buildPrompt(context?: string): string {
        const clean = (context ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT_CHARS);
        // El prompt de Whisper no es una instrucción: es "texto anterior" que
        // le marca el estilo y el vocabulario (tildes, puntuación, términos).
        const topic = clean ? `sobre "${clean}"` : 'sobre tecnología';
        return `Consulta de un alumno ${topic}. Términos: ${TECH_VOCABULARY}.`;
    }
}
