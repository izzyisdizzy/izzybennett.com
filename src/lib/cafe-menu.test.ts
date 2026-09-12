import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMenu, sectionItems, MENU_SECTIONS } from './cafe-menu';

// The live menu, read the way Astro hands it to the parser: `page.body` excludes frontmatter.
const MENU_MD = 'src/content/pages/izzys-cafe.md';
const liveBody = readFileSync(MENU_MD, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
const liveSections = parseMenu(liveBody);

// These assert the *shape* of the live menu and never its contents. The menu is edited through
// /update-menu and committed by the Worker, so pinning item text here would fail CI on every menu
// edit and block the deploy — leaving the sign stranded on a stale feed, the exact failure these
// tests exist to prevent.
describe('the live cafe menu', () => {
  it('parses into non-empty sections', () => {
    expect(liveSections.length).toBeGreaterThan(0);
    for (const section of liveSections) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('uses only canonical MENU_SECTIONS headings', () => {
    for (const section of liveSections) {
      expect(MENU_SECTIONS).toContain(section.heading);
    }
  });

  it('keeps sections in MENU_SECTIONS order', () => {
    const order = liveSections.map((s) =>
      MENU_SECTIONS.indexOf(s.heading as (typeof MENU_SECTIONS)[number])
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  // /order builds its drink chips from this section; an empty one renders a form nobody can submit.
  it('offers at least one drink', () => {
    expect(sectionItems(liveSections, 'Drinks').length).toBeGreaterThan(0);
  });
});

describe('parseMenu', () => {
  it('treats "Menu" as a wrapper, not a section', () => {
    const sections = parseMenu('## Menu\n- stray\n\n#### Drinks\n- Coffee\n');
    expect(sections.map((s) => s.heading)).toEqual(['Drinks']);
    expect(sections[0].items).toEqual(['Coffee']);
  });

  it('matches the wrapper heading case-insensitively', () => {
    expect(parseMenu('## MENU\n#### Food\n- Cake\n').map((s) => s.heading)).toEqual(['Food']);
  });

  it('accepts any heading level from ## to ######', () => {
    const sections = parseMenu('## Drinks\n- a\n##### Milks\n- b\n###### Syrups\n- c\n');
    expect(sections.map((s) => s.heading)).toEqual(['Drinks', 'Milks', 'Syrups']);
  });

  it('accepts both - and * bullets', () => {
    expect(parseMenu('#### Drinks\n- Coffee\n* Matcha\n')[0].items).toEqual(['Coffee', 'Matcha']);
  });

  it('drops sections that have no items', () => {
    const sections = parseMenu('#### Drinks\n- Coffee\n\n#### Food\n\n#### Milks\n- Oat\n');
    expect(sections.map((s) => s.heading)).toEqual(['Drinks', 'Milks']);
  });

  it('trims padding around headings and items', () => {
    const sections = parseMenu('  ####   Drinks   \n  -   Coffee   \n');
    expect(sections[0].heading).toBe('Drinks');
    expect(sections[0].items).toEqual(['Coffee']);
  });

  it('ignores bullets that appear before any heading', () => {
    expect(parseMenu('- orphan\n#### Drinks\n- Coffee\n')[0].items).toEqual(['Coffee']);
  });

  it('ignores prose between sections', () => {
    expect(parseMenu('Some intro prose.\n\n#### Drinks\n- Coffee\n')[0].items).toEqual(['Coffee']);
  });

  it('returns [] for an empty body', () => {
    expect(parseMenu('')).toEqual([]);
  });
});

describe('sectionItems', () => {
  const sections = parseMenu('#### Drinks\n- Coffee\n#### Milks\n- Oat\n');

  // /order looks sections up by the MENU_SECTIONS spelling; a case drift in the markdown must not
  // silently empty a chip group.
  it('matches a heading case-insensitively', () => {
    expect(sectionItems(sections, 'drinks')).toEqual(['Coffee']);
    expect(sectionItems(sections, 'DRINKS')).toEqual(['Coffee']);
  });

  it('returns the matching section items', () => {
    expect(sectionItems(sections, 'Milks')).toEqual(['Oat']);
  });

  it('returns [] when the heading is absent', () => {
    expect(sectionItems(sections, 'Syrups')).toEqual([]);
  });
});
