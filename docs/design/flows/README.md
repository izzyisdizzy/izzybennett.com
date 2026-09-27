# izzybennett.com flows — design snapshot

A read-only copy of the **"izzybennett.com flows"** design canvas, the design
reference for the Dizzy redesign milestones (see "Dizzy redesign roadmap" in the
repo's `CLAUDE.md`).

- **Canvas:** https://claude.ai/artifact/HXci9x4HvxvwAVVoy1uncm — private, so
  agents and most readers can't open it. This folder is the readable reference.
- **Snapshot of:** canvas version `1790536192-ad38`, taken 2026-09-27 for #77
  (Dizzy M8). Files are copied byte-for-byte; don't edit them here. If the
  canvas changes, re-snapshot the whole set and bump the version above.

## How to read a board

Each `*.dc.html` is a template for the canvas runtime, not a standalone page — it
won't render correctly if opened directly in a browser.

- The markup between `<x-dc>` tags is the board. `{{…}}` are bindings filled by
  the `Component` class in the `<script type="text/x-dc">` block at the bottom;
  `<sc-for>` / `<sc-if>` are its loop and conditional.
- The `data-props` JSON on that script lists the board's **tweaks** (the Theme
  section) and their defaults.
- The boards link `support.js` (canvas runtime) and `ds/dizzy/components/*` (the
  canvas's own copy of the Dizzy design system). Both are **deliberately not
  copied**: `src/dizzy/` is the design system's source of truth in this repo, and
  a second copy would drift.
- `site.css` is the canvas's page stylesheet (`.iz-*` helpers, type classes, and
  the `data-theme` / `data-shadows` / `data-retro` / `data-ground` / `data-night`
  rules). `iz-bounce.js` is its motion helpers: the pixel burst on press and
  single-wave title bounces. Both are the reference for porting, not code to
  import.
- `canvas.json` is the canvas layout: each board's title, size, desktop/phone page
  and position, plus the flow headings.

## Boards

Every board has a desktop version (1280px wide) and a phone twin (`-m`, 390px),
except Grounds. The flows start from Home.

| Board | Files | Flow | What it shows |
| :-- | :-- | :-- | :-- |
| Home | `Main.dc.html`, `Main-m.dc.html` | all | Hero window with bouncing name, four entry buttons, latest recipes, project card |
| Recipes | `Recipes.dc.html`, `Recipes-m.dc.html` | 1 · Find & cook a recipe | Recipe index with filter and search |
| Recipe | `Recipe.dc.html`, `Recipe-m.dc.html` | 1 · Find & cook a recipe | Recipe page (Raspberry Lemon Scones) with the US / grams switch; `ingredients.txt` + `steps.txt` windows |
| Cafe | `Cafe.dc.html`, `Cafe-m.dc.html` | 2 · Order a drink at the cafe | Menu board + order window (drink, milk, temp, name) |
| Order | `Order.dc.html`, `Order-m.dc.html` | 2 · Order a drink at the cafe | Order confirmed: "Coming right up." receipt window (`order-000042.txt`) |
| Projects | `Projects.dc.html`, `Projects-m.dc.html` | 3 · Browse projects | Grid of project windows (dizzyos, izzybennett.com, recipes.json) |
| Project | `Project.dc.html`, `Project-m.dc.html` | 3 · Browse projects | Project detail (dizzyos): live demo window, `facts.txt`, `more-projects.txt` |
| Resume | `Resume.dc.html`, `Resume-m.dc.html` | 4 · Read the resume | Resume page in a `resume.pdf` window |
| Orders / Kitchen | `Orders.dc.html`, `Orders-m.dc.html` | 5 · Run the kitchen | Kitchen display: new / making / done columns |
| Nav | (in every board except Grounds) | — | No board of its own. Desktop: brand, link bar, theme toggle (see `Main.dc.html`). At 390px the links collapse into a "Menu" sheet (`details.iz-mnav`) next to the toggle (see `Main-m.dc.html`). |
| Grounds | `Grounds.dc.html` (desktop only) | — | "Background options": every page-colour option side by side. **Exploration only.** |

## Tweaks: what ships

The Theme tweaks on each board were for exploring. **Only the defaults ship:**

| Tweak | Ships | Exploration only — not to be built |
| :-- | :-- | :-- |
| Theme | `daylight` (light) and `afterglow` (dark), user-toggled as today | — |
| Ground (light page colour) | **sea glass** `#EBF2F1` | sage, cream, blush, lavender |
| Night (dark page colour) | **neon purple** `#1A0F2E` | espresso, neon green |
| Shadows | **fewer** | full |
| Retro | **on** | off |

The site gets no palette picker and no switches for these; the shipped values are
simply what the tokens and styles are. The Grounds board and every non-default
option exist only to record what was considered.
