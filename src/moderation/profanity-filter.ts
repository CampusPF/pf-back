/**
 * Primera capa de moderación: lista de términos, local y determinística.
 *
 * Existe aunque haya IA por dos motivos:
 * 1. No depende de la red. Si Groq se cae o se agota la cuota, las groserías
 *    se siguen bloqueando igual; sólo lo sutil (un insulto sin malas
 *    palabras, una burla) queda sin revisar.
 * 2. Es instantánea y no gasta cuota: lo obvio no llega a la API.
 *
 * Qué entra en la lista: palabras que son ofensivas EN CUALQUIER CONTEXTO.
 * Qué NO entra: palabras que dependen del contexto ("inútil", "basura",
 * "estafa", "tonto"). "El material es inútil" es una crítica legítima y se
 * tiene que publicar; "el profe es un inútil" no. Eso lo distingue la IA,
 * que lee la oración entera — una lista no puede.
 *
 * Compara PALABRAS ENTERAS (tokens), nunca substrings: así "computadora" no
 * cae por "puta", ni "calculo" por "culo", ni "ortografía" por "orto".
 *
 * Antes de comparar normaliza las evasiones típicas:
 * - mayúsculas y tildes          "MIÉRDA"      → "mierda"
 * - leetspeak                    "m1erd4"      → "mierda"
 * - letras estiradas             "mierdaaaa"   → "mierda"
 * - letras separadas             "m.i.e.r.d.a" → "mierda"
 * - asteriscos como máscara      "m*erda"      → coincide con "mierda"
 */

/** Groserías, insultos y agravios. Forma base, en minúscula. */
const BASE_TERMS = [
  // Groserías
  'mierda', 'carajo', 'puta', 'puto', 'putita', 'putazo', 'concha', 'conchudo',
  'pija', 'pijudo', 'verga', 'garcha', 'orto', 'ojete', 'culo', 'culiado',
  'culiao', 'choto', 'chota', 'sorete', 'cagada', 'cagar', 'cague', 'cagon',
  'caga', 'cago', 'joder', 'jodete', 'coño', 'poronga', 'teta', 'pajero',
  'chupala', 'chupame', 'malparido', 'cornudo', 'bastardo', 'cabron',
  'gilipollas', 'pendejo', 'chingada', 'chingar',
  // Insultos a personas
  'pelotudo', 'boludo', 'forro', 'gil', 'idiota', 'imbecil', 'estupido',
  'tarado', 'mogolico', 'retrasado', 'subnormal', 'salame', 'otario', 'nabo',
  'garca', 'chanta', 'lacra', 'escoria',
  // Agravios discriminatorios
  'marica', 'maricon', 'trolo', 'sudaca', 'villero',
  // Inglés
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'asshole', 'dick', 'cunt', 'bastard', 'nigger', 'nigga', 'faggot', 'retard',
  'whore', 'slut', 'idiot', 'stupid', 'moron',
];

/**
 * Abreviaturas que se usan justamente para esquivar filtros. Sin variantes de
 * género ni plural: se comparan tal cual.
 */
const ABBREVIATIONS = [
  'hdp', 'hdps', 'lpm', 'lpmqtp', 'lpqtp', 'lpqtpario', 'lcdtm', 'lcdll',
  'ptm', 'ctm', 'csm', 'qlo', 'stfu', 'kys',
];

/**
 * Frases cuyas palabras por separado son inocentes. Ojo al sumar: tienen que
 * ser ofensivas siempre ("hijo de" no sirve: "mi hijo de 10 años...").
 */
const PHRASES = ['al pedo', 'me cago'];

const LEET: Record<string, string> = {
  '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o',
  '5': 's', '$': 's', '7': 't', '8': 'b',
};

/** Masculino/femenino y plural a partir de la forma base. */
function variants(term: string): string[] {
  const out = new Set([term, `${term}s`, `${term}es`]);
  if (term.endsWith('o')) {
    const stem = term.slice(0, -1);
    out.add(`${stem}a`).add(`${stem}os`).add(`${stem}as`);
  }
  if (term.endsWith('a')) out.add(`${term.slice(0, -1)}as`);
  return [...out];
}

/**
 * Minúsculas, sin tildes, leetspeak resuelto y letras repetidas colapsadas.
 * La ñ se preserva (como "ny") para que "coño" no se confunda con "cono".
 * Los `*` se conservan (y no se colapsan): son la máscara de `matchesMasked`.
 */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    // "¡" y "!" al borde son puntuación, no leet: "puto!" no es "putoi".
    .replace(/^[!|]+|[!|]+$/g, '')
    .replace(/ñ/g, 'ny')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[4@31!|05$78]/g, (c) => LEET[c] ?? c)
    .replace(/([^*])\1+/g, '$1');
}

const BLOCKED_WORDS = new Set(
  [...BASE_TERMS.flatMap(variants), ...ABBREVIATIONS].map(normalizeWord),
);

const BLOCKED_PHRASES = PHRASES.map((p) => p.split(' ').map(normalizeWord).join(' '));

const SEPARATORS = /[\s.\-_,·]+/;

/**
 * Busca corridas de 4+ caracteres sueltos separados ("m i e r d a",
 * "m.i.e.r.d.a") y las devuelve unidas. Palabras reales cortas como
 * "y a la" no llegan a 4 y no se tocan.
 */
function spacedLetterRuns(text: string): string[] {
  const runs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length >= 4) runs.push(current.join(''));
    current = [];
  };
  for (const part of text.split(SEPARATORS)) {
    if (part.length === 1) current.push(part);
    else flush();
  }
  flush();
  return runs;
}

/** "m*erda" coincide con "mierda": cada tramo de `*` tapa de 1 a 3 letras. */
function matchesMasked(token: string): boolean {
  if (token.replace(/\*/g, '').length < 2) return false;
  const body = token.replace(/[.+?^$(){}[\]\\]/g, '\\$&').replace(/\*+/g, '.{1,3}');
  const pattern = new RegExp('^' + body + '$');
  for (const word of BLOCKED_WORDS) {
    if (pattern.test(word)) return true;
  }
  return false;
}

/** El primer término bloqueado que aparece, o `null` si el texto está limpio. */
export function findBlockedTerm(text: string): string | null {
  const tokens = text
    // Todo lo que no sea letra, dígito (leet) o máscara separa palabras.
    .split(/[^\p{L}\d@!|$*]+/u)
    .filter(Boolean)
    .map(normalizeWord)
    .filter(Boolean);

  for (const token of tokens) {
    if (BLOCKED_WORDS.has(token)) return token;
    if (token.includes('*') && matchesMasked(token)) return token;
  }

  // Letras separadas: acá SÍ se busca como substring, porque la corrida es
  // deliberada ("a m i e r d a" → "amierda") y no una palabra real.
  for (const run of spacedLetterRuns(text).map(normalizeWord)) {
    for (const word of BLOCKED_WORDS) {
      if (word.length >= 4 && run.includes(word)) return word;
    }
  }

  const joined = ` ${tokens.join(' ')} `;
  for (const phrase of BLOCKED_PHRASES) {
    if (joined.includes(` ${phrase} `)) return phrase;
  }

  return null;
}
