export interface ModerationVerdict {
  allowed: boolean;
  /** Categoría de la política ("insulto", "vulgaridad"...). Sólo para el log. */
  category: string | null;
  /** Explicación del modelo. Sólo para el log: nunca se muestra al usuario. */
  rationale: string | null;
}

/**
 * Proveedor de moderación con IA (la segunda capa; la primera es la lista
 * local de `profanity-filter.ts`). El servicio sólo conoce este contrato:
 * cambiar de proveedor es registrar otra clase en ModerationModule.
 */
export interface ModerationProvider {
  readonly name: string;

  /** false si falta la API key: el servicio saltea esta capa. */
  isConfigured(): boolean;

  /**
   * Contrato de seguridad (el mismo que AiProvider del tutor):
   * el texto del usuario viaja SIEMPRE como mensaje role:'user', nunca
   * concatenado dentro de la política. Si se concatenara, un "ignorá las
   * instrucciones anteriores" quedaría al mismo nivel que las reglas.
   *
   * Tira error si el proveedor no responde o responde algo inválido: decidir
   * qué hacer en ese caso es del servicio, no del proveedor.
   */
  check(text: string, signal?: AbortSignal): Promise<ModerationVerdict>;
}

export const MODERATION_PROVIDER = 'MODERATION_PROVIDER';
