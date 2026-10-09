import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationPolicy, ModerationProvider, ModerationVerdict } from './moderation.types';
import { REVIEW_MODERATION_POLICY } from './review-policy';
import { FORUM_MODERATION_POLICY } from './forum-policy';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const POLICY_PROMPTS: Record<ModerationPolicy, string> = {
  review: REVIEW_MODERATION_POLICY,
  forum: FORUM_MODERATION_POLICY,
};

/**
 * Moderación con `openai/gpt-oss-safeguard-20b` en Groq: un modelo que
 * clasifica contra una política escrita por nosotros (review-policy.ts).
 * Reusa GROQ_API_KEY, la misma key del tutor.
 *
 * Es el reemplazo que Groq recomienda para Llama Guard 4, deprecado el
 * 5/3/2026. Doc: https://console.groq.com/docs/model/openai/gpt-oss-safeguard-20b
 */
@Injectable()
export class GroqModerationProvider implements ModerationProvider {
  readonly name = 'groq-safeguard';
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GROQ_API_KEY');
    this.model = config.get<string>('MODERATION_MODEL') ?? 'openai/gpt-oss-safeguard-20b';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async check(text: string, policy: ModerationPolicy, signal?: AbortSignal): Promise<ModerationVerdict> {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: this.model,
        // Clasificar tiene que ser repetible: mismo comentario, mismo veredicto.
        temperature: 0,
        // Razonamiento corto y fuera de la respuesta: sólo queremos el JSON.
        reasoning_effort: 'low',
        include_reasoning: false,
        // Holgado a propósito: los tokens de razonamiento también cuentan acá,
        // y cortarlo a mitad de camino devolvería un JSON incompleto.
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: POLICY_PROMPTS[policy] },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`[${this.name}] HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return parseVerdict(payload.choices?.[0]?.message?.content);
  }
}

/**
 * Interpreta la respuesta del modelo. Tolera que `violation` venga como
 * número, string o booleano; si no viene, es una respuesta inválida y tira
 * (el servicio decide qué hacer), en vez de tomarla como "aprobado".
 */
export function parseVerdict(content: string | undefined): ModerationVerdict {
  const json = content?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('Respuesta de moderación sin JSON');

  const parsed = JSON.parse(json) as {
    violation?: unknown;
    category?: unknown;
    rationale?: unknown;
  };

  const violation = parsed.violation;
  if (violation === undefined || violation === null) {
    throw new Error('Respuesta de moderación sin "violation"');
  }

  const isViolation = violation === true || Number(violation) === 1;
  return {
    allowed: !isViolation,
    category: typeof parsed.category === 'string' ? parsed.category : null,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : null,
  };
}
