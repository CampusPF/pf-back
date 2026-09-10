/**
 * Slug de curso: lo usa el front para resolver una URL /cursos/:slug contra
 * el listado de GET /courses antes de pedir el detalle por id.
 *
 * `slugify` es a propósito simple: baja a minúsculas, saca acentos, y todo lo
 * que no sea [a-z0-9] pasa a "-". No pretende cubrir todos los alfabetos.
 */
export function slugify(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos y diacriticos combinados
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Genera un slug único a partir de `source`. Si el slug base ya está tomado
 * (dos cursos con el mismo título es válido), agrega un sufijo numérico:
 * "react-avanzado", "react-avanzado-2", "react-avanzado-3", ...
 *
 * `slugExists` decide contra qué se compara (repo de TypeORM, un Set en
 * memoria durante un backfill, etc.).
 */
export async function generateUniqueSlug(
  source: string,
  slugExists: (slug: string) => boolean | Promise<boolean>,
): Promise<string> {
  const root = slugify(source) || 'curso';
  let candidate = root;
  let suffix = 2;
  while (await slugExists(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
