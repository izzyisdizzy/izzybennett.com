# Recipe API Worker

Cloudflare Worker that powers "Sign in with GitHub" on `izzybennett.com/upload`. It runs the
OAuth handshake (holding the client secret) and proxies every recipe create/update/delete so the
**GitHub token never reaches the browser** — the browser only holds an opaque session id.

## One-time setup

1. **Register a GitHub OAuth App** — GitHub → Settings → Developer settings → **OAuth Apps** → New:
   - Application name: `Izzy recipe uploader` (anything)
   - Homepage URL: `https://izzybennett.com`
   - **Authorization callback URL:** `https://<your-worker-url>/callback`
     (e.g. `https://izzy-recipe-api.<subdomain>.workers.dev/callback`)
   - Generate a client secret. Note the **Client ID** and **Client Secret**.

2. **Create the KV namespace** and copy the ids into `wrangler.toml`:
   ```sh
   npx wrangler kv namespace create SESSIONS
   npx wrangler kv namespace create SESSIONS --preview
   ```

3. **Register a GitHub App** — GitHub → Settings → Developer settings → **GitHub Apps** → New.
   This is what actually writes to the repo, so editors need no repo access of their own:
   - Name: `izzy-recipe-bot` (anything); Homepage URL: `https://izzybennett.com`
   - **Uncheck "Active" under Webhook** — this App is never called by GitHub.
   - **Repository permissions → Contents: Read and write.** Nothing else.
   - Create it, note the **App ID**, then **Generate a private key** (downloads a `.pem`).
   - **Install** it (left sidebar → Install App) on `OWNER/REPO`, choosing **Only select
     repositories** → `izzybennett.com`. The number at the end of the resulting
     `/settings/installations/<id>` URL is your **Installation ID**.

4. **Fill in `wrangler.toml`** — `GITHUB_CLIENT_ID`, `GITHUB_APP_ID`,
   `GITHUB_APP_INSTALLATION_ID`, the KV `id`/`preview_id`, and (if different) `RECIPE_EDITORS`,
   `ADMIN_LOGINS`, `SITE_ORIGIN`.

5. **Set the secrets.** Pipe the key in from the file rather than pasting it — the interactive
   prompt mangles a multi-line paste, and the truncated result fails in a way that looks like a
   bad key rather than a bad paste:
   ```sh
   npx wrangler secret put GITHUB_CLIENT_SECRET   # short, safe to paste at the prompt
   npx wrangler secret put GITHUB_APP_PRIVATE_KEY < /path/to/your-app.private-key.pem
   ```

6. **Deploy:**
   ```sh
   npm install
   npm run deploy
   ```

7. Point the site at the Worker: set `PUBLIC_RECIPE_API` to the Worker's base URL when building the
   Astro site (see the repo root README / `deploy.yml`).

## Two GitHub identities, on purpose

Keeping these straight is the whole design:

- The **OAuth App** answers *who is this?* and nothing else. Its token is read once for the login,
  then discarded — no user credential is ever stored.
- The **GitHub App** performs every write, as itself.

Because writes never borrow the signed-in user's permissions, an editor needs **no repo access at
all**. The only route to the repo is through this Worker, which checks capabilities and restricts
paths — so a recipe editor genuinely cannot touch anything but recipes.

## Who can do what

Two comma-separated lists in `wrangler.toml`, matched case-insensitively. `ADMIN_LOGINS` implies
recipe access, so admins are listed only once. Anyone not named gets no session at all.

| Capability | From | Grants |
| ---------- | ---- | ------ |
| `recipes`  | `RECIPE_EDITORS` | add/edit/delete `RECIPE_DIR/<slug>.md`, grow `DENSITIES_PATH` |
| `admin`    | `ADMIN_LOGINS`   | the above, plus the cafe menu and the `/orders` kitchen toggle |

Capabilities are re-resolved from config on every request, not baked into the session — so
removing someone takes effect on their next call, not whenever their session happens to expire.

## Local dev

```sh
cp .dev.vars.example .dev.vars   # add your client secret + App private key
npm install
npm run dev
```

For local testing, register a second OAuth App (or edit the existing one) whose callback points at
`http://localhost:8787/callback`, and set `SITE_ORIGIN` to your local site origin.

## Endpoints

| Method + path        | Auth                       | Purpose                                  |
| -------------------- | -------------------------- | ---------------------------------------- |
| `GET /login`         | —                          | Redirect to GitHub consent               |
| `GET /callback`      | state cookie               | Exchange code, resolve capabilities, mint session |
| `POST /api/recipe`   | `Bearer <session>` + `recipes` | Create/update `RECIPE_DIR/<slug>.md` (409 if exists and `overwrite` false) |
| `DELETE /api/recipe` | `Bearer <session>` + `recipes` | Delete a recipe file                     |
| `POST /api/menu`     | `Bearer <session>` + `admin`   | Overwrite the cafe menu                  |
| `GET /api/me`        | `Bearer <session>`         | `{ login, capabilities, admin }` — callers must check `admin` themselves |
| `POST /logout`       | `Bearer <session>`         | Destroy the session                      |

Every proxied path is hard-restricted to `RECIPE_DIR/<slug>.md`, `DENSITIES_PATH`, or the single
fixed `MENU_PATH` on `OWNER/REPO@BRANCH`.
