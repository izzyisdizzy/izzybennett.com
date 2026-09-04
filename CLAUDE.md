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

- `src/content/recipes/*.md` — the recipes. `src/content.config.ts` is their Zod
  schema: `title`, `category` (one of `main|dessert|side|sauce|drink|other`),
  structured `ingredients` (grouped, with optional freeform `qty`/`unit` so
  "2 ¼" and "6-8" survive), `steps`, `notes`, `draft`, and `keywords` (search
  only — not a browsable taxonomy).
- `src/content/pages/*.md` — freeform pages, including the `izzys-cafe` entry
  whose markdown body **is** the cafe menu.
- `src/pages/` — routes. Note the JSON endpoints: `izzys-cafe.json.ts`,
  `recipes.json.ts`, `densities.json.ts`.
- `src/lib/` — `cafe-menu.ts` (the shared menu parser), `ingredients.ts` +
  `units.ts` (US→grams conversion, with `ingredients.test.ts`), `markdown.ts`.
- `worker/` — Cloudflare Worker (`wrangler.toml`): the GitHub OAuth handshake and
  recipe create/update/delete proxy behind `/upload`.
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
  `parseMenu` in `src/lib/cafe-menu.ts`. Don't add a second menu representation.
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
  `content.config.ts` invalidates every existing file in `src/content/recipes/`;
  give new fields a default or make them optional.
