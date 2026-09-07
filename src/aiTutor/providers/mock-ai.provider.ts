import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, AiChatMessage } from './ai-provider.interface';

/**
 * Implementación temporal: simula respuestas de un tutor de IA
 * sin depender de ninguna API externa. Útil para desarrollar y
 * probar todo el flujo (conversaciones, mensajes, límites de uso)
 * antes de conectar un proveedor real.
 *
 * Cuando decidas el proveedor, reemplazá esta clase por
 * AnthropicProvider u OpenAiProvider (ver ejemplos comentados abajo)
 * y cambiá el binding en ai-tutor.module.ts.
 */
@Injectable()
export class MockAiProvider implements AiProvider {
  private readonly logger = new Logger(MockAiProvider.name);

  async generateReply(history: AiChatMessage[], lessonContext?: string): Promise<string> {
    const lastUserMessage = history[history.length - 1]?.content ?? '';

    this.logger.warn(
      'Usando MockAiProvider — reemplazar por un proveedor real antes de producción.',
    );

    return `[Respuesta simulada] Recibí tu mensaje: "${lastUserMessage}". ` +
      `Cuando conectemos un proveedor de IA real, acá vas a recibir una respuesta ` +
      `contextualizada con el contenido de la lección${lessonContext ? ` "${lessonContext}"` : ''}.`;
  }
}

/* ============================================================
   EJEMPLO — AnthropicProvider (cuando decidas usar Claude)
   ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { buildTutorSystemPrompt, AI_MAX_OUTPUT_TOKENS } from './ai-provider.interface';

@Injectable()
export class AnthropicProvider implements AiProvider {
  private client: Anthropic;

  constructor(config: ConfigService) {
    // La API key sale de env y jamás se loguea ni se devuelve al front.
    this.client = new Anthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
  }

  async generateReply(history: AiChatMessage[], lessonContext?: string): Promise<string> {
    const response = await this.client.messages.create({
      // TODO(seguridad): fijar el modelo definitivo al elegir proveedor.
      model: 'claude-sonnet-4-5',
      // Tope de salida: sin esto una sola conversación puede costar mucho.
      max_tokens: AI_MAX_OUTPUT_TOKENS,
      // Las reglas del tutor van en `system`, separadas del input del alumno.
      system: buildTutorSystemPrompt(lessonContext),
      // El texto del alumno va siempre acá, como role:'user'. Nunca dentro
      // del system prompt (eso sería prompt injection servida en bandeja).
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  }
}

   ============================================================
   EJEMPLO — OpenAiProvider (cuando decidas usar GPT)
   ============================================================

import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { buildTutorSystemPrompt, AI_MAX_OUTPUT_TOKENS } from './ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
  private client: OpenAI;

  constructor(config: ConfigService) {
    // La API key sale de env y jamás se loguea ni se devuelve al front.
    this.client = new OpenAI({ apiKey: config.getOrThrow('OPENAI_API_KEY') });
  }

  async generateReply(history: AiChatMessage[], lessonContext?: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      // TODO(seguridad): fijar el modelo definitivo al elegir proveedor.
      model: 'gpt-4o-mini',
      // Tope de salida: sin esto una sola conversación puede costar mucho.
      max_tokens: AI_MAX_OUTPUT_TOKENS,
      messages: [
        // Las reglas del tutor van en el mensaje `system`, separadas del
        // input del alumno.
        { role: 'system', content: buildTutorSystemPrompt(lessonContext) },
        // El texto del alumno va siempre acá, como role:'user'. Nunca dentro
        // del system prompt (eso sería prompt injection servida en bandeja).
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
============================================================ */