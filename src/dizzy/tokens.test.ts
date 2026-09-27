import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { build, TOKENS_CSS, THEME_CSS } from '../../scripts/build-dizzy-tokens.mjs';

// tokens.json is the source of truth; the two CSS files are generated from it and committed.
// This fails the moment someone edits the JSON (or the generator) without re-running
// `npm run dizzy:tokens`, so the stylesheets can never quietly drift from the token file.
describe('generated Dizzy token stylesheets', () => {
  const { tokensCss, themeCss } = build();

  it('tokens.css matches tokens.json', () => {
    expect(readFileSync(TOKENS_CSS, 'utf8')).toBe(tokensCss);
  });

  it('tailwind-theme.css matches tokens.json', () => {
    expect(readFileSync(THEME_CSS, 'utf8')).toBe(themeCss);
  });

  it('declares both themes and the OS fallback', () => {
    expect(tokensCss).toContain(':root, [data-theme="daylight"]');
    expect(tokensCss).toContain('[data-theme="afterglow"]');
    expect(tokensCss).toContain(':root:not([data-theme="daylight"])');
    // The self-hosted variable faces lead the stacks; the token's own name stays as fallback.
    expect(tokensCss).toContain('--font-display: "Baloo 2 Variable", "Baloo 2"');
    expect(tokensCss).toContain('--font-body: "Space Grotesk Variable", "Space Grotesk"');
  });

  it('aliases only colours into Tailwind', () => {
    expect(themeCss).toContain('--color-hotpink: var(--hotpink);');
    // A same-named alias (--radius-md: var(--radius-md)) would be self-referential and invalid.
    expect(themeCss).not.toMatch(/--radius-|--shadow-|--font-display|--space-/);
  });
});
