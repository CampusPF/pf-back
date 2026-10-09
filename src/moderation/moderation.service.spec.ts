import { UnprocessableEntityException } from '@nestjs/common';
import { ModerationService, REJECTED_COMMENT_MESSAGE } from './moderation.service';
import { ModerationProvider } from './moderation.types';
import { parseVerdict } from './groq-moderation.provider';

/**
 * Lo que importa blindar es el orden de las capas y qué pasa cuando la IA
 * falla: la lista bloquea SIEMPRE, y una IA caída no deja a nadie sin reseñar.
 */
describe('ModerationService', () => {
  let check: jest.Mock;
  let configured: boolean;
  let service: ModerationService;

  beforeEach(() => {
    check = jest.fn().mockResolvedValue({ allowed: true, category: null, rationale: null });
    configured = true;
    const provider: ModerationProvider = {
      name: 'fake',
      isConfigured: () => configured,
      check,
    };
    service = new ModerationService(provider);
  });

  it('publica un comentario limpio que la IA aprueba', async () => {
    await expect(service.assertPublishable('Muy buen curso')).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledWith('Muy buen curso', 'review', expect.any(AbortSignal));
  });

  it('usa la política "forum" cuando se la pasan explícitamente', async () => {
    await expect(service.assertPublishable('te recomiendo este link', 'forum')).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledWith('te recomiendo este link', 'forum', expect.any(AbortSignal));
  });

  it('bloquea con la lista local sin llegar a la IA', async () => {
    await expect(service.assertPublishable('una mierda')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(check).not.toHaveBeenCalled();
  });

  it('bloquea lo que la IA rechaza, con el mensaje genérico (sin el motivo del modelo)', async () => {
    check.mockResolvedValue({ allowed: false, category: 'insulto', rationale: 'Ataca al docente.' });

    const error = await service.assertPublishable('El profe no sirve para nada').catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toBe(REJECTED_COMMENT_MESSAGE);
  });

  it('si la IA falla, publica (ya pasó la lista local)', async () => {
    check.mockRejectedValue(new Error('HTTP 503'));
    await expect(service.assertPublishable('Muy buen curso')).resolves.toBeUndefined();
  });

  it('si la IA falla, la lista local sigue bloqueando', async () => {
    check.mockRejectedValue(new Error('HTTP 503'));
    await expect(service.assertPublishable('pelotudo')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('sin GROQ_API_KEY no llama a la IA, pero la lista sigue activa', async () => {
    configured = false;
    await expect(service.assertPublishable('Muy buen curso')).resolves.toBeUndefined();
    await expect(service.assertPublishable('hdp')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(check).not.toHaveBeenCalled();
  });
});

describe('parseVerdict', () => {
  it('interpreta violation como número, string o booleano', () => {
    expect(parseVerdict('{"violation":1}').allowed).toBe(false);
    expect(parseVerdict('{"violation":"1"}').allowed).toBe(false);
    expect(parseVerdict('{"violation":true}').allowed).toBe(false);
    expect(parseVerdict('{"violation":0}').allowed).toBe(true);
  });

  it('tolera texto alrededor del JSON', () => {
    const verdict = parseVerdict('Resultado: {"violation":1,"category":"insulto","rationale":"x"}');
    expect(verdict).toEqual({ allowed: false, category: 'insulto', rationale: 'x' });
  });

  it('tira si la respuesta no trae veredicto, en vez de tomarla como aprobada', () => {
    expect(() => parseVerdict('{"category":null}')).toThrow();
    expect(() => parseVerdict('no sé')).toThrow();
    expect(() => parseVerdict(undefined)).toThrow();
  });
});
