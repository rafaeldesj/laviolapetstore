const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

interface Searchable {
  name: string;
  brand?: string | null;
  sku?: string | null;
}

/** Palavras digitadas, sem acento e sem maiúsculas: "quat salm" → ["quat", "salm"]. */
export const searchTokens = (query: string): string[] => normalize(query).split(/\s+/).filter(Boolean);

/** Vale se TODAS as palavras aparecem em qualquer parte do nome, da marca ou do código (pedaços de palavra servem). */
export function matchesQuery(p: Searchable, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = normalize(`${p.name} ${p.brand || ''} ${p.sku || ''}`);
  return tokens.every(t => hay.includes(t));
}

/**
 * Busca por partes de palavras. Os mais parecidos vêm primeiro: nome que começa com o que foi digitado,
 * depois palavras que começam com o digitado, depois o resto, em ordem alfabética.
 */
export function searchProducts<T extends Searchable>(products: T[], query: string, limit = 60): { items: T[]; total: number } {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return { items: [], total: 0 };
  const scored: { p: T; score: number; name: string }[] = [];
  for (const p of products) {
    if (!matchesQuery(p, tokens)) continue;
    const name = normalize(p.name);
    const words = name.split(/[^a-z0-9]+/);
    let score = 0;
    if (name.startsWith(tokens[0])) score -= 2;
    score -= tokens.filter(t => words.some(w => w.startsWith(t))).length;
    if (p.sku && normalize(p.sku) === tokens[0]) score -= 10;
    scored.push({ p, score, name });
  }
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'));
  return { items: scored.slice(0, limit).map(s => s.p), total: scored.length };
}
