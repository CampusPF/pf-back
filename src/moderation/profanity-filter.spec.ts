import { findBlockedTerm } from './profanity-filter';

/**
 * Los dos lados importan igual: que las groserías no pasen, y que una crítica
 * negativa respetuosa (o una palabra inocente que CONTIENE una grosería) no
 * se bloquee. Un falso positivo acá es una reseña legítima censurada.
 */
describe('findBlockedTerm', () => {
  describe('bloquea', () => {
    it.each([
      ['Una mierda de curso', 'grosería simple'],
      ['MIERDA', 'mayúsculas'],
      ['Mierdaaaaa', 'letras estiradas'],
      ['m1erd4', 'leetspeak'],
      ['m*erda total', 'asterisco como máscara'],
      ['m**rda', 'varios asteriscos'],
      ['m i e r d a', 'letras separadas por espacios'],
      ['m.i.e.r.d.a', 'letras separadas por puntos'],
      ['es una m-i-e-r-d-a', 'letras separadas por guiones en medio de una frase'],
      ['El profe es un pelotudo', 'insulto'],
      ['son unas pelotudas', 'insulto en femenino plural'],
      ['Qué boludo', 'insulto rioplatense'],
      ['la puta madre, qué bueno', 'grosería como énfasis positivo'],
      ['puto!', 'con signo de exclamación pegado'],
      ['¡Idiota!', 'entre signos de exclamación'],
      ['Imbécil', 'con tilde'],
      ['hdp', 'abreviatura'],
      ['LPM que malo', 'abreviatura en mayúsculas'],
      ['estuvo al pedo', 'frase'],
      ['what a piece of shit', 'inglés'],
      ['coño', 'con eñe'],
    ])('"%s" (%s)', (text) => {
      expect(findBlockedTerm(text)).not.toBeNull();
    });
  });

  describe('NO bloquea', () => {
    it.each([
      ['Muy flojo, las explicaciones son confusas y el audio se escucha mal.', 'crítica negativa respetuosa'],
      ['No lo recomiendo, es caro para lo poco que enseña.', 'crítica al precio'],
      ['El material es inútil y está desactualizado.', 'crítica dura al material (lo decide la IA, no la lista)'],
      ['Una pregunta tonta: ¿hay certificado?', 'palabra dependiente del contexto'],
      ['Me compré una computadora nueva para hacerlo.', 'contiene "puta"'],
      ['El cálculo del módulo 3 es difícil.', 'contiene "culo"'],
      ['Buena ortografía en los apuntes.', 'contiene "orto"'],
      ['Mi hijo de 10 años lo hizo y le encantó.', '"hijo de" sin nada más'],
      ['Aprendí a hacer un cono de papel.', '"cono" no es "coño"'],
      ['Excelente!!! 10/10, lo recomiendo.', 'signos y números'],
      ['Módulos a, b, c y d muy completos.', 'letras sueltas legítimas'],
      ['', 'vacío'],
    ])('"%s" (%s)', (text) => {
      expect(findBlockedTerm(text)).toBeNull();
    });
  });
});
