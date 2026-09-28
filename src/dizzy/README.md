# src/dizzy — the Dizzy design system, vendored

The site's copy of the Dizzy design system. It came from the private
"izzybennett.com flows" design canvas (see `docs/design/flows/README.md`), which
has no upstream git repository. **This directory is the source of truth**: the
canvas's own `ds/dizzy/components/*` copy is deliberately not mirrored, and there
is nowhere to send changes back to.

| File | What it is |
| :-- | :-- |
| `tokens.json` | Source of truth for colours (`daylight` / `afterglow`), type, spacing, radii, strokes, shadows. |
| `tokens.css`, `tailwind-theme.css` | **Generated** from `tokens.json` by `npm run dizzy:tokens` (`scripts/build-dizzy-tokens.mjs`). Don't hand-edit; `tokens.test.ts` fails on drift. |
| `bundle.css` | The `dz-*` components and motion. Imported into the `components` layer by `src/styles/global.css`. |
| `bundle.js` | `window.Dizzy`: `bouncify`, `marquee`, `segmented`, `init`. Typed by `index.d.ts`. |

Site-specific overrides belong in `src/styles/site.css` (same layer, imported
after `bundle.css`), not here. The exceptions are the local patches below, which
change behaviour the site can't override from outside.

## Local patches

Each patch is marked in the source with a `Local patch (izzybennett.com)` comment.
They are **permanent**: with no upstream repo, there is nothing to upstream them
to. If `bundle.css`/`bundle.js` are ever re-copied from the canvas, re-apply them.

1. **Grapheme-cluster split in `bouncify`** (`bundle.js`, the `chars` split).
   Letters are split with `Intl.Segmenter` (falling back to `Array.from`) instead
   of `charAt(i)`, so an emoji or a combining accent bounces as one glyph instead
   of two broken UTF-16 halves.
2. **Single-wave `hover` / `once` bounces** (`bundle.js` `replayOnHover`, plus the
   `.dz-bouncy--hover` / `--once` / `.dz-bouncing` rules in `bundle.css`).
   Upstream pauses an infinite bounce loop on mouse-out, which freezes letters
   mid-air. Here each wave runs to completion and replays only while the title is
   still hovered or focused. Reduced motion is checked on every wave, so toggling
   the OS setting applies live. `index.d.ts` documents the
   `'always' | 'hover' | 'once'` trigger.
