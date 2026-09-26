import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMenu, sectionItems, MENU_SECTIONS } from '@izzy/cafe-menu';

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
