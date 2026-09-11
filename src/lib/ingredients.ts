/**
 * Ingredient ↔ step linking. Recipe ingredients are structured `{ name, qty?, unit? }`
 * (see content.config.ts); steps are free-form prose that name those ingredients. This
 * module builds a name→measurement index from a recipe's ingredients and rewrites step
 * HTML so each ingredient mention becomes a bold hover/tap target showing its measurement.
 *
 * Matching is lexical and works from the ingredient's stored name, which is often more
 * qualified than the step prose ("granulated sugar" vs "sugar", "vanilla bean paste" vs
 * "vanilla"). To bridge that gap each ingredient registers several surface forms:
 *   - the full name (specific);
 *   - every trailing suffix / "head noun" ("vegetable oil" → "oil") (generic);
 *   - the name with leading qualifiers or a trailing descriptor stripped
 *     ("vanilla bean paste" → "vanilla", "unsalted butter" → "butter") (generic).
 * When a prose word matches, a *specific* (full-name) match always wins over *generic*
 * aliases — so a recipe with a plain "sugar" resolves "sugar" to that, while a recipe with
 * only "granulated sugar" + "powdered sugar" resolves "sugar" to both (shown with labels).
 *
 * All logic is pure and build-time (Astro SSG) — no client parsing.
 */

export interface StructuredItem {
  name: string;
  qty?: string;
  unit?: string;
  /** Prep note ("softened"). Carried for typing only — popovers show amounts, not prep. */
  detail?: string;
}

export interface IngredientGroup {
  group?: string;
  items: StructuredItem[];
}

/** One measured occurrence of an ingredient — its name, US + grams amounts, and group. */
interface Entry {
  name: string;
  us: string;
  grams: string | null;
  group?: string;
}

/** Entries reachable by a surface form, split by how precisely they matched it. */
interface FormEntries {
  specific: Entry[];
  generic: Entry[];
}

export interface IngredientIndex {
  /** Surface form → the entries it resolves to, by specificity. */
  forms: Map<string, FormEntries>;
  /** Combined, longest-match-first matcher over all forms, or null when nothing indexable. */
  regex: RegExp | null;
}

/**
 * Leading words describing preparation or type that step prose routinely drops
 * ("unsalted butter" → "butter", "granulated sugar" → "sugar"). Stripping these only ever
 * produces a *generic* alias, so it never overrides a real ingredient of the bare name.
 */
const LEADING_STRIP = new Set([
  // preparation
  'softened', 'melted', 'chopped', 'finely', 'coarsely', 'ground', 'packed', 'sifted',
  'diced', 'minced', 'shredded', 'grated', 'peeled', 'beaten', 'crushed', 'toasted',
  'sliced', 'halved', 'quartered', 'cubed', 'drained', 'rinsed', 'trimmed', 'thinly',
  'roughly', 'ripe', 'cold', 'warm', 'hot', 'boneless', 'skinless',
  // size / type qualifiers dropped in prose
  'small', 'medium', 'large', 'unsalted', 'salted', 'vegetable', 'granulated', 'greek',
  'loose', 'fresh', 'dried', 'whole', 'light', 'dark', 'heavy', 'all', 'purpose',
]);

/** Trailing descriptors to peel so a front-distinctive name yields its everyday alias. */
const TRAILING_FORMS = ['bean paste', 'tea leaves', 'paste', 'extract', 'leaves', 'puree'];

/** Too-generic surface forms to never register as match targets. */
const STOP_FORMS = new Set([
  'paste', 'extract', 'leaves', 'grey', 'bean', 'ingredient', 'ingredients', 'temp',
  'purpose', 'powder', 'soda', 'water',
]);

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Collapse whitespace and lowercase — the normal form used for all name comparisons. */
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Ingredient's US measurement label, e.g. "½ cup", "8 tbsp", or "4" for count items. */
function measurementLabel(item: StructuredItem): string {
  return [item.qty, item.unit].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
}

/** Canonical ingredient name: drop a parenthetical, a comma-note, and normalise. */
function cleanName(name: string): string {
  const noParen = name.replace(/\([^)]*\)/g, ' ');
  return norm((noParen.split(',')[0] ?? '').trim());
}

/** Remove leading qualifier words (keeps at least the final word). */
function stripLeading(name: string): string {
  const words = name.split(' ');
  let i = 0;
  while (i < words.length - 1 && LEADING_STRIP.has(words[i])) i++;
  return words.slice(i).join(' ');
}

/** Peel trailing descriptor words: "vanilla bean paste" → "vanilla". */
function stripTrailing(name: string): string {
  let out = name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const tail of TRAILING_FORMS) {
      if (out === tail) return '';
      if (out.endsWith(` ${tail}`)) {
        out = out.slice(0, -tail.length - 1).trim();
        changed = true;
        break;
      }
    }
  }
  return out;
}

function singularize(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ses|xes|zes|ches|shes|oes)$/.test(word)) return word.replace(/es$/, '');
  if (/ss$/.test(word)) return word;
  if (/s$/.test(word)) return word.replace(/s$/, '');
  return word;
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/.test(word)) return word.replace(/y$/, 'ies');
  if (/(s|x|z|ch|sh|o)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** A phrase plus singular/plural variants of its last word, for both-way number matching. */
function phraseForms(phrase: string): string[] {
  const words = phrase.split(' ');
  const last = words[words.length - 1];
  const base = singularize(last);
  const variants = [...new Set([last, base, pluralize(base)])];
  const head = words.slice(0, -1);
  return variants.map((w) => [...head, w].join(' '));
}

/** Generic alias phrases for a canonical name: head nouns + leading/trailing-stripped forms. */
function genericAliases(canonical: string): Set<string> {
  const out = new Set<string>();
  const words = canonical.split(' ');
  for (let i = 1; i < words.length; i++) out.add(words.slice(i).join(' ')); // head-noun suffixes

  const lead = stripLeading(canonical);
  if (lead && lead !== canonical) out.add(lead);

  const pre = stripTrailing(canonical);
  if (pre && pre !== canonical) {
    out.add(pre);
    const preLead = stripLeading(pre);
    if (preLead) out.add(preLead);
  }
  return out;
}

/**
 * Build the surface-form index for one recipe's ingredient groups. Items with no
 * measurement (e.g. "Oil spray") are skipped. A name appearing in multiple groups — or
 * several qualified names sharing one generic alias — surfaces all their measurements.
 */
export function buildIngredientIndex(
  groups: IngredientGroup[],
  gramsOf?: (item: StructuredItem) => string | null
): IngredientIndex {
  const forms = new Map<string, FormEntries>();

  const add = (form: string, entry: Entry, specific: boolean) => {
    const key = norm(form);
    if (key.length < 2 || STOP_FORMS.has(key)) return;
    const rec = forms.get(key) ?? { specific: [], generic: [] };
    (specific ? rec.specific : rec.generic).push(entry);
    forms.set(key, rec);
  };

  for (const g of groups) {
    for (const item of g.items) {
      const us = measurementLabel(item);
      if (!us) continue;
      const canonical = cleanName(item.name);
      if (!canonical) continue;
      const grams = gramsOf ? gramsOf(item) : null;
      const entry: Entry = { name: canonical, us, grams, group: g.group };

      for (const f of phraseForms(canonical)) add(f, entry, true);
      for (const alias of genericAliases(canonical)) {
        for (const f of phraseForms(alias)) add(f, entry, false);
      }
    }
  }

  return { forms, regex: buildRegex([...forms.keys()]) };
}

/** Combined, word-boundary-anchored, longest-match-first regex over all surface forms. */
function buildRegex(forms: string[]): RegExp | null {
  if (forms.length === 0) return null;
  const alternation = forms
    .sort((a, b) => b.length - a.length) // longest first → "granulated sugar" beats "sugar"
    .map((form) => form.split(' ').map(escapeRegex).join('\\s+'))
    .join('|');
  return new RegExp(`\\b(${alternation})\\b`, 'gi');
}

/** Resolve a matched surface form to its entries: a specific (full-name) hit wins over aliases. */
function resolve(index: IngredientIndex, matched: string): Entry[] {
  const rec = index.forms.get(norm(matched));
  if (!rec) return [];
  const chosen = rec.specific.length > 0 ? rec.specific : rec.generic;
  const seen = new Set<string>();
  return chosen.filter((e) => {
    const k = `${e.name}|${e.us}|${e.grams ?? ''}|${e.group ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The amount cell for one entry. Carries both US and (when known) grams text; which one
 * shows is driven by the page's `data-units` mode via CSS. A cell with a grams equivalent is
 * marked `.ing-conv` so grams mode can hide only its US text (count/unknown items stay US).
 */
function amountHtml(e: Entry): string {
  const us = `<span class="ing-us">${escapeHtml(e.us)}</span>`;
  const grams = e.grams ? `<span class="ing-grams">${escapeHtml(e.grams)}</span>` : '';
  return `<span class="ing-amt${e.grams ? ' ing-conv' : ''}">${us}${grams}</span>`;
}

/** The interactive trigger + measurement popover for one matched ingredient mention. */
function buildTrigger(label: string, entries: Entry[], id: number): string {
  const popId = `ing-pop-${id}`;
  // A single measurement shows just the amount; group labels only earn their place when
  // they disambiguate between multiple measurements of the same mention.
  const inner =
    entries.length === 1
      ? amountHtml(entries[0])
      : entries
          .map(
            (e) =>
              `<span class="ing-pop-row">${amountHtml(e)} <span class="ing-pop-group">· ${escapeHtml(e.group ?? e.name)}</span></span>`
          )
          .join('');
  return (
    `<span class="ing-ref">` +
    `<button type="button" class="ing-ref-btn" aria-expanded="false" aria-describedby="${popId}">${escapeHtml(label)}</button>` +
    `<span role="tooltip" id="${popId}" class="ing-pop">${inner}</span>` +
    `</span>`
  );
}

/**
 * Rewrite already-rendered step HTML, wrapping ingredient mentions in popover triggers.
 *
 * Runs on the HTML produced by inlineMarkdown (markdown-first): the tokenizer only ever
 * touches plain-text runs, so it can't corrupt tags or entities, and it skips text inside
 * <a>/<code> to avoid nesting a button in a link or mangling code. `idState` threads a
 * per-page counter so every popover gets a unique id across all steps.
 */
export function linkIngredientsInHtml(
  html: string,
  index: IngredientIndex,
  idState: { n: number } = { n: 0 }
): string {
  const { regex } = index;
  if (!regex) return html;

  let skipDepth = 0;
  // Split into tags, entities, and the text between them; odd matches are tags/entities.
  return html
    .split(/(<[^>]+>|&[^;\s]+;)/)
    .map((token) => {
      if (!token) return token;

      if (token[0] === '<') {
        if (/^<(a|code)[\s>]/i.test(token)) skipDepth++;
        else if (/^<\/(a|code)>/i.test(token) && skipDepth > 0) skipDepth--;
        return token;
      }
      if (token[0] === '&') return token; // HTML entity — leave untouched
      if (skipDepth > 0) return token; // inside <a>/<code>

      return token.replace(regex, (match) => {
        const entries = resolve(index, match);
        if (entries.length === 0) return match;
        return buildTrigger(match, entries, idState.n++);
      });
    })
    .join('');
}
