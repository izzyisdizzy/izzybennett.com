# CLAUDE.md

## Project Status

izzybennett.com is the personal site — resume, recipes, projects, and Izzy's Cafe
(menu + ordering). Astro with Tailwind, statically built and deployed to GitHub
Pages, with two small backends alongside it. Tech decisions, and why:

- **Astro content collections for anything list-shaped.** Recipes are structured
  markdown validated by a Zod schema; adding one is a new file, no route wiring.
- **Static site + narrow backends.** The site builds to static HTML. The two
  things that can't be static each get a minimal service: a Cloudflare Worker for
  authenticated recipe uploads, and a Pi-hosted order server.
- **Secrets never reach the browser.** The Worker holds the GitHub OAuth client
  secret and proxies every recipe write; the browser only ever holds an opaque
  session id.

### Layout

- `src/content/recipes/*.md` — the recipes. Their Zod schema is `recipeSchema`
  from `@izzy/recipe-engine/schema`, wired up in `src/content.config.ts`: `title`, `category` (one of `main|dessert|side|sauce|drink|other`),
  structured `ingredients` (grouped, with optional freeform `qty`/`unit` so
  "2 ¼" and "6-8" survive), `steps`, `notes`, `draft`, and `keywords` (search
  only — not a browsable taxonomy). Since engine v2, also optional `yield` and
  `oven` (meta strip) and, per ingredient item, `key` (defaults to the slug of
  `name`) and `grams` (override). Steps can reference an ingredient as `[[key]]`
  or `[[key|display text]]`; unbracketed prose is still matched lexically. An
  unknown or ambiguous `[[key]]` **fails the build**, listing the valid keys.
  ⚠️ `/upload` doesn't know the v2 fields yet (M6): editing a recipe there drops
  `yield`/`oven`/`key`/`grams`, so hand-edit recipes that use them.
- `src/content/pages/*.md` — freeform pages, including the `izzys-cafe` entry
  whose markdown body **is** the cafe menu.
- `src/content/projects/*.md` — the projects. Frontmatter (`title`, `tagline`,
  `repo`, `icon` relative to the entry, `order`, `links`, optional `demo`)
  drives the `/projects/` grid of `ProjectWindow`s; the markdown body is the
  `/projects/<slug>/` page, styled by `.iz-prose` (fenced code is themed through
  Shiki's light/dark CSS variables — see `astro.config.mjs`). `demo: cafe-feed | recipes-feed`
  adds a `FeedDemo` window that fetches the live feed client-side, read-only.
- `src/dizzy/` — the Dizzy design system, vendored: `tokens.json` (source of
  truth: colours for the `daylight`/`afterglow` themes, type, spacing, radii,
  strokes, shadows), `bundle.css` (the `dz-*` components + motion), `bundle.js`
  (`window.Dizzy`: `bouncify`, `marquee`, `segmented`, `init`) and `index.d.ts`.
  `tokens.css` and `tailwind-theme.css` are **generated** from the JSON by
  `npm run dizzy:tokens`. `src/styles/site.css` holds the type classes
  (`.display-xl`, `.mono`, …) and the `.iz-*` page helpers; `src/styles/global.css`
  wires it all up. Theme = `<html data-theme>`, stamped before paint by
  `ThemeBoot.astro` (stored choice in `localStorage['izzy-theme']`, else the OS)
  and flipped by `ThemeToggle.astro`. Tailwind is for layout; colour, type and
  shape come from Dizzy classes.
- `src/pages/` — routes. Note the JSON endpoints: `izzys-cafe.json.ts`,
  `recipes.json.ts`, `densities.json.ts`.
- `src/lib/izzys-cafe-content.test.ts` — asserts the *live* menu content's shape
  (canonical sections, in order, at least one drink). Never item text.
- `@izzy/cafe-menu` ([izzyisdizzy/cafe-menu](https://github.com/izzyisdizzy/cafe-menu),
  pinned by git tag) — `parseMenu`, `sectionItems`, `MENU_SECTIONS`, and their
  unit tests. Used by `izzys-cafe.json.ts`, `/order` and `/update-menu`. Its
  output **is** the sign's feed: before bumping the pin, byte-diff the built
  `dist/izzys-cafe.json` against the live one, and prefer doing it with the
  kitchen closed.
- `@izzy/recipe-engine` ([izzyisdizzy/recipe-engine](https://github.com/izzyisdizzy/recipe-engine),
  pinned by git tag in `package.json`) — the recipe schema, `units` (US→grams
  conversion), `ingredients` (step↔ingredient linking), `markdown`,
  `ingredient-suggest`, the `/upload` ingredient typeahead, the recipe page body
  (`Recipe.astro`) and index row
  (`RecipeCard.astro`), their client scripts and styles, and all their tests.
  `src/pages/recipes/[...slug].astro` wraps `Recipe` in `BaseLayout` and runs the
  session check; `src/styles/global.css` must keep importing
  `@izzy/recipe-engine/styles/recipes.css`, which also registers the package with
  Tailwind — drop it and the recipe pages lose ~20 utilities silently. Changing
  recipe logic or UI means a change + new tag there, then bumping the pin here.
  The density table (`src/data/densities.json`) stays here — it's the Worker's
  write target.
- `@izzy/auth-client` ([izzyisdizzy/auth-client](https://github.com/izzyisdizzy/auth-client),
  pinned by git tag) — the browser half of sign-in: `SESSION_KEY`, `#session=`
  ingestion, `applyAuthState()`, `signOut()`, and the `.auth-only` /
  `.auth-when-out` CSS (imported by `global.css`). Module scripts import it
  directly; `/upload` and `/update-menu` (`define:vars` scripts, which can't
  import) get `SESSION_KEY` injected from their frontmatter — never re-spell it.
  `.auth-only` is a *signed-in* gate: admin-only UI must check `/api/me` → `admin`.
- The Cloudflare Worker (`izzy-recipe-api`) lives in its own repo,
  [izzyisdizzy/auth-worker](https://github.com/izzyisdizzy/auth-worker) (locally
  `~/Development/auth-worker`): the GitHub OAuth handshake, `/api/me` capabilities,
  and the recipe/menu write proxy. It still writes to *this* repo's content, and
  deploys manually from there (`npm run deploy`) — nothing here deploys it.
- `order-server/` — FastAPI + SQLite service (`main.py`, `orders.db`)
  running on the Pi behind a Cloudflare Tunnel at `orders.izzybennett.com`,
  backing `/order` and the `/orders` kitchen queue. CORS is locked to the site
  origin; there is deliberately no auth.

### Build / run / test

```sh
npm install
npm run dev        # localhost:4321
npm run build      # -> ./dist
npm run preview    # preview the build
npm run test       # vitest
```

**Node ≥ 22.12 is required** (`engines` in `package.json`; CI pins node 22). A
newer runtime — node 26 in particular — fails the Astro build. If `npm run build`
dies unexpectedly, check `node -v` before debugging anything else.

### Invariants to preserve

- **Deploys from `master`, not `main`.** `.github/workflows/deploy.yml` triggers
  on push to `master` and publishes `./dist` to GitHub Pages.
- **The JSON endpoints are public contracts.** `/izzys-cafe.json` is consumed by
  the **dizzyos** LED-matrix sign (`/Users/ibennett/Development/dizzyos`,
  `apps/cafe_menu`). Changing that shape breaks hardware in the kitchen — treat
  it as a versioned API, not an internal detail.
- **The cafe menu markdown is the single source of truth.** The `izzys-cafe` page
  body feeds the JSON endpoint, the order form, and the sign, all through
  `parseMenu` from `@izzy/cafe-menu`. Don't add a second menu representation.
- **`MENU_SECTIONS` is locked in code.** `Drinks | Milks | Syrups | Food` — the
  order form assigns meaning by those exact names, which is why `/update-menu`
  won't let section names be edited freely. Renaming one is a code change across
  parser, order form, and sign.
- **The GitHub token never reaches the browser.** Any new recipe-write path goes
  through the Worker; the client holds only the opaque session id.
- **Build-time config comes from repo Variables.** `PUBLIC_RECIPE_API` and
  `PUBLIC_ORDER_API` are set in repo Settings → Variables and injected by the
  deploy workflow — don't hardcode either URL.
- **Recipe schema changes are migrations.** Adding a required field to
  `recipeSchema` (in `@izzy/recipe-engine`) invalidates every existing file in
  `src/content/recipes/`; give new fields a default or make them optional.
- **Never hand-edit `src/dizzy/tokens.css` or `tailwind-theme.css`.** They are
  generated from `tokens.json`; `src/dizzy/tokens.test.ts` fails when they drift.
  Change the JSON, run `npm run dizzy:tokens`, commit all three. `bundle.css` and
  `site.css` are imported into Tailwind's `components` layer on purpose — that is
  what lets a layout utility (`hidden`, `sm:flex`) override a `dz-*` default.
- **Clear `.astro/` after bumping `@izzy/recipe-engine`.** Astro keys its content
  cache on `content.config.ts`'s own bytes, not its imports, so a schema change in
  the package is invisible to it. `prebuild` does `rm -rf .astro`; `npm run dev`
  does not, so clear it by hand.
