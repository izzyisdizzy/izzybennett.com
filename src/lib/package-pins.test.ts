import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The @izzy/* packages come straight from GitHub (no registry), so the pin in package.json is
// the only thing that says which release the site is built against. A pin to a branch or a bare
// commit works on a laptop but can vanish on the remote: a squash-merged, deleted feature branch
// leaves its commits unreachable, and the deploy's `npm ci` then fails to resolve the package.
// So every @izzy/* dependency must name a release tag. The deploy workflow runs these tests
// before building, which means a branch pin that slips through review blocks the deploy (the
// live site stays on the previous release) instead of breaking it later.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
const izzy = Object.entries(deps).filter(([name]) => name.startsWith('@izzy/'));

describe('@izzy/* dependency pins', () => {
  it('finds the packages it guards', () => {
    expect(izzy.length).toBeGreaterThan(0);
  });

  it.each(izzy)('%s is pinned to a release tag', (_name, spec) => {
    expect(spec).toMatch(/^github:izzyisdizzy\/[\w.-]+#v\d+\.\d+\.\d+$/);
  });
});
