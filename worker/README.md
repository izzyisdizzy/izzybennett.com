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

3. **Fill in `wrangler.toml`** — `GITHUB_CLIENT_ID`, the KV `id`/`preview_id`, and (if different)
   `ALLOWED_LOGINS`, `SITE_ORIGIN`.

4. **Set the secret:**
   ```sh
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

5. **Deploy:**
   ```sh
   npm install
   npm run deploy
   ```

6. Point the site at the Worker: set `PUBLIC_RECIPE_API` to the Worker's base URL when building the
   Astro site (see the repo root README / `deploy.yml`).

## Local dev

```sh
cp .dev.vars.example .dev.vars   # add your client secret
npm install
npm run dev
```

For local testing, register a second OAuth App (or edit the existing one) whose callback points at
`http://localhost:8787/callback`, and set `SITE_ORIGIN` to your local site origin.

## Endpoints

| Method + path        | Auth                    | Purpose                                  |
| -------------------- | ----------------------- | ---------------------------------------- |
| `GET /login`         | —                       | Redirect to GitHub consent               |
| `GET /callback`      | state cookie            | Exchange code, gate on `ALLOWED_LOGINS`, mint session |
| `POST /api/recipe`   | `Bearer <session>`      | Create/update `RECIPE_DIR/<slug>.md` (409 if exists and `overwrite` false) |
| `DELETE /api/recipe` | `Bearer <session>`      | Delete a recipe file                     |
| `POST /logout`       | `Bearer <session>`      | Destroy the session                      |

Every proxied path is hard-restricted to `RECIPE_DIR/<slug>.md` on `OWNER/REPO@BRANCH`.
