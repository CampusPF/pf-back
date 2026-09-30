import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { findBlockedTerm } from './profanity-filter';
import { MODERATION_PROVIDER } from './moderation.types';
import type { ModerationProvider, ModerationVerdict } from './moderation.types';

/** Más que esto y el alumno siente que la app se colgó. */
const MODERATION_TIMEOUT_MS = 6000;

/**
 * Mensaje ÚNICO para cualquier rechazo, venga de la lista o de la IA. No dice
 * qué palabra ni qué categoría: decirlo le enseña a esquivar el filtro, y el
 * motivo de la IA es texto generado que no controlamos.
 */
export const REJECTED_COMMENT_MESSAGE =
  'Tu comentario tiene lenguaje ofensivo y no lo podemos publicar. Podés reescribirlo y volver a enviarlo: las críticas son bienvenidas mientras sean respetuosas.';

/**
 * Moderación de texto escrito por usuarios. Dos capas, en orden:
 *
 * 1. Lista local (profanity-filter.ts): groserías e insultos evidentes, con
 *    sus disfraces (leet, letras separadas, asteriscos). Corre SIEMPRE, sin
 *    red. Es la que garantiza que una grosería no pase nunca.
 * 2. IA (Groq safeguard): lo que una lista no ve — un insulto sin malas
 *    palabras, una burla, odio, spam, datos personales.
 *
 * Si la IA falla (caída, timeout, cuota, respuesta inválida) el comentario se
 * publica — ya pasó la lista — y queda un warn en el log. Es FAIL-OPEN a
 * propósito: una caída de un tercero no puede dejar a nadie sin reseñar. Si
 * algún día hace falta lo contrario, se cambia en `checkWithAi` y nada más.
 */
@Injectable()
export class ModerationService implements OnModuleInit {
  private readonly logger = new Logger(ModerationService.name);

  constructor(@Inject(MODERATION_PROVIDER) private readonly provider: ModerationProvider) {}

  onModuleInit(): void {
    // Que se vea al arrancar si la capa de IA está prendida: sin esto, una key
    // faltante deja la moderación a medias sin que nadie se entere.
    if (this.provider.isConfigured()) {
      this.logger.log(`Moderación: lista local + IA (${this.provider.name})`);
    } else {
      this.logger.warn('Moderación: sólo lista local (falta GROQ_API_KEY para la capa de IA)');
    }
  }

  /** Lanza 422 si el texto no se puede publicar. */
  async assertPublishable(text: string): Promise<void> {
    const blockedTerm = findBlockedTerm(text);
    if (blockedTerm) {
      this.logger.log(`Comentario rechazado por la lista local ("${blockedTerm}")`);
      throw new UnprocessableEntityException(REJECTED_COMMENT_MESSAGE);
    }

    const verdict = await this.checkWithAi(text);
    if (verdict && !verdict.allowed) {
      this.logger.log(`Comentario rechazado por la IA (${verdict.category}): ${verdict.rationale}`);
      throw new UnprocessableEntityException(REJECTED_COMMENT_MESSAGE);
    }
  }

  /** `null` = la IA no está configurada o no respondió: no hay veredicto. */
  private async checkWithAi(text: string): Promise<ModerationVerdict | null> {
    if (!this.provider.isConfigured()) return null;

    try {
      return await this.provider.check(text, AbortSignal.timeout(MODERATION_TIMEOUT_MS));
    } catch (error) {
      this.logger.warn(
        `Moderación con IA no disponible; se publica tras pasar la lista local: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
