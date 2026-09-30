import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { MODERATION_PROVIDER } from './moderation.types';
import { GroqModerationProvider } from './groq-moderation.provider';

/**
 * Moderación de texto de usuarios (hoy, comentarios de reseñas). Quien la use
 * importa este módulo y llama a `ModerationService.assertPublishable`.
 */
@Module({
  providers: [
    ModerationService,
    // El servicio sólo conoce MODERATION_PROVIDER: cambiar de proveedor de IA
    // es cambiar esta línea.
    { provide: MODERATION_PROVIDER, useClass: GroqModerationProvider },
  ],
  exports: [ModerationService],
})
export class ModerationModule {}
