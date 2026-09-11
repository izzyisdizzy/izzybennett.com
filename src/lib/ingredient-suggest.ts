/**
 * Ranking for the ingredient-name typeahead on /upload. Pure and DOM-free so it can be
 * tested directly; the DOM wiring lives in scripts/ingredient-typeahead.ts.
 *
 * The candidate pool is the key set of data/densities.json — exactly the ingredients whose
 * measurements are already known. That's deliberate: updateItemRow in upload.astro gates its
 * "how many grams?" prompt on an *exact* key hit (`name in densities`), not on lookupDensity's
 * progressive word-drop, so completing to a real key is what both silences that prompt and
 * guarantees the recipe page can convert the amount.
 */

export interface Suggestion {
  name: string;
  /** True only for a prefix match — the one case with a sensible inline completion. */
  isPrefix: boolean;
}

/** Shortest query worth matching. One letter pulls in far too much of the list. */
export const MIN_QUERY_LENGTH = 2;

/** Default number of suggestions offered; enough to see the alternatives, short enough to scan. */
export const DEFAULT_LIMIT = 6;

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Rank `names` against what's been typed, best first.
 *
 * Matches fall into three tiers, each exhausted before the next: a prefix of the whole name
 * ("ba" → "baking powder"), a prefix of any later word ("sug" → "brown sugar"), then a bare
 * substring ("oco" → "chocolate chips"). Within a tier the order is alphabetical, which is
 * what puts "baking powder" ahead of "baking soda" — sorting by length would invert that.
 */
export function rankIngredientSuggestions(
  query: string,
  names: readonly string[],
  limit: number = DEFAULT_LIMIT
): Suggestion[] {
  const q = norm(query ?? '');
  if (q.length < MIN_QUERY_LENGTH || limit <= 0) return [];

  const tiers: string[][] = [[], [], []];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = norm(raw ?? '');
    // An exact hit has nothing left to complete, so it's not worth offering.
    if (!name || name === q || seen.has(name)) continue;
    seen.add(name);
    if (name.startsWith(q)) tiers[0].push(name);
    else if (name.includes(` ${q}`)) tiers[1].push(name);
    else if (name.includes(q)) tiers[2].push(name);
  }

  const out: Suggestion[] = [];
  for (const [tier, bucket] of tiers.entries()) {
    for (const name of bucket.sort()) {
      if (out.length >= limit) return out;
      out.push({ name, isPrefix: tier === 0 });
    }
  }
  return out;
}
