/**
 * Recipe API — Cloudflare Worker that turns the pasted-PAT flow on /upload into a proper
 * "Sign in with GitHub" OAuth flow, WITHOUT ever handing a GitHub token to the browser.
 *
 * Flow:
 *   GET  /login        → 302 to GitHub's OAuth consent screen (state stored in a cookie)
 *   GET  /callback     → exchange code→token (uses the client secret), verify the user is
 *                        on the ALLOWED_LOGINS allowlist, mint an opaque session id, stash
 *                        {token,login} in KV, then 302 back to the site with the session id
 *                        in the URL fragment.
 *   POST   /api/recipe → create/update a recipe file (auth: `Authorization: Bearer <session>`)
 *   DELETE /api/recipe → delete a recipe file
 *   POST   /api/menu   → overwrite the cafe menu file (auth: `Authorization: Bearer <session>`)
 *   POST   /logout     → destroy the session
 *
 * The browser only ever holds the opaque session id. The GitHub token lives in KV and is
 * injected server-side here, and every proxied call is hard-restricted to RECIPE_DIR/<slug>.md
 * or the single fixed MENU_PATH on OWNER/REPO@BRANCH — so a leaked session can only ever touch
 * those files.
 */

export interface Env {
  SESSIONS: KVNamespace;
  // Secret (wrangler secret put):
  GITHUB_CLIENT_SECRET: string;
  // Vars (wrangler.toml [vars]):
  GITHUB_CLIENT_ID: string;
  ALLOWED_LOGINS: string;
  OWNER: string;
  REPO: string;
  BRANCH: string;
  RECIPE_DIR: string;
  DENSITIES_PATH: string;
  SITE_ORIGIN: string;
  SESSION_TTL: string;
}

interface Session {
  token: string;
}

const GH_API = 'https://api.github.com';
const GH_OAUTH = 'https://github.com/login/oauth';
const UA = 'izzy-recipe-worker';
const SLUG_RE = /^[a-z0-9-]+$/;

// The one fixed file the /api/menu route may write — the cafe menu, single source of truth for
// the order form, the /izzys-cafe.json feed, and the dizzyos LED sign. Hard-coded (not derived
// from client input) so a menu save can never reach any other path.
const MENU_PATH = 'src/content/pages/izzys-cafe.md';

// Pages sign-in may return to. An allowlist (not raw reflection of `return_to`) keeps the
// post-OAuth redirect from becoming an open redirect. First entry is the default fallback.
const RETURN_PATHS = ['/upload', '/recipes/', '/orders/', '/update-menu'];
const DEFAULT_RETURN = RETURN_PATHS[0];
const safeReturn = (path: string | null): string =>
  path && RETURN_PATHS.includes(path) ? path : DEFAULT_RETURN;

// Who may sign in. ALLOWED_LOGINS is a comma-separated list of GitHub logins; compared
// case-insensitively, since GitHub logins are case-preserving but not case-sensitive.
// Note each editor writes with their OWN OAuth token, so a login listed here must also have
// push access to OWNER/REPO or their commits will fail at the Contents API.
const isAllowedLogin = (login: string | undefined, allowed: string): boolean => {
  if (!login) return false;
  const target = login.toLowerCase();
  return allowed
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== '' && entry === target);
};

// The two first-party OAuth cookies in their cleared (Max-Age=0) form. Appended on every callback
// exit — success or failure — so a half-finished sign-in never leaves them lingering in the browser.
const CLEAR_AUTH_COOKIES = ['oauth_state', 'oauth_return'].map(
  (name) => `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
);

// Top-level frontmatter keys the /upload form owns and re-serializes on every save. Any OTHER
// key found in an existing recipe (e.g. `image`) is NOT modelled by the form, so on update we
// carry it over from the old file — otherwise editing a recipe through /upload would silently
// drop it. Note: keys the form DOES manage but omits when empty (draft, description, …) are
// deliberately absent here, so clearing them still works.
const MANAGED_FIELDS = new Set([
  'title', 'description', 'category', 'keywords', 'prepTime', 'cookTime',
  'servings', 'tools', 'ingredients', 'steps', 'notes', 'draft',
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for the browser-facing API endpoints.
    if (request.method === 'OPTIONS') return preflight(env);

    try {
      // `await` matters: it lets this try/catch catch async rejections, so a thrown ApiError
      // becomes a proper JSON response WITH CORS headers (a bare throw would yield Cloudflare's
      // headerless 500, which the browser can't even read across origins).
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /login':
          return handleLogin(url, env);
        case 'GET /callback':
          // A browser navigation lands here, so surface failures as the friendly HTML page.
          return await handleCallback(request, url, env).catch(() =>
            htmlError('Something went wrong during sign-in. Please try again.', 400, CLEAR_AUTH_COOKIES)
          );
        case 'POST /api/recipe':
          return await withSession(request, env, (_id, s) => putRecipe(request, env, s));
        case 'DELETE /api/recipe':
          return await withSession(request, env, (_id, s) => deleteRecipe(request, env, s));
        case 'POST /api/menu':
          return await withSession(request, env, (_id, s) => putMenu(request, env, s));
        case 'POST /logout':
          return await withSession(request, env, (id) => logout(env, id));
        case 'GET /api/me':
          // Lightweight session check for other first-party backends (e.g. the Pi order server,
          // which gates the kitchen open/close toggle on it). A valid session can only belong to
          // an ALLOWED_LOGINS entry — minted nowhere else — so "session valid" == "an allowed user".
          return await withSession(request, env, async () => json(env, 200, { ok: true }));
        case 'GET /':
          return json(env, 200, { ok: true, service: 'izzy-recipe-api' });
        default:
          return json(env, 404, { error: 'Not found' });
      }
    } catch (err) {
      if (err instanceof ApiError) return json(env, err.status, { error: err.message });
      const message = err instanceof Error ? err.message : 'Unexpected error';
      return json(env, 500, { error: message });
    }
  },
};

// Thrown by helpers to signal a specific HTTP status to the client, instead of a generic 500.
class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// ---- OAuth: login ---------------------------------------------------------

function handleLogin(url: URL, env: Env): Response {
  const state = crypto.randomUUID();
  const returnTo = safeReturn(url.searchParams.get('return_to'));
  const authorize = new URL(`${GH_OAUTH}/authorize`);
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authorize.searchParams.set('scope', 'public_repo'); // least privilege that allows Contents writes
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('allow_signup', 'false');

  // Stash the state (checked on callback) and the return path (where to land after) in short-lived,
  // first-party (worker-origin) cookies. Two Set-Cookie headers, hence a Headers instance.
  const headers = new Headers({ Location: authorize.toString() });
  const cookieOpts = 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600';
  headers.append('Set-Cookie', `oauth_state=${state}; ${cookieOpts}`);
  headers.append('Set-Cookie', `oauth_return=${returnTo}; ${cookieOpts}`);
  return new Response(null, { status: 302, headers });
}

// ---- OAuth: callback ------------------------------------------------------

async function handleCallback(request: Request, url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(request, 'oauth_state');

  if (!code || !state || !cookieState || state !== cookieState) {
    return htmlError('Sign-in failed: invalid or expired state. Please try again.', 400, CLEAR_AUTH_COOKIES);
  }

  // Exchange the code for a token — the only place the client secret is used.
  const tokenRes = await fetch(`${GH_OAUTH}/access_token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  const token = tokenData.access_token;
  if (!token) {
    return htmlError(`Sign-in failed: ${tokenData.error ?? 'no token returned'}.`, 400, CLEAR_AUTH_COOKIES);
  }

  // Identify the user and gate on the allowlist — the OAuth App is public, so anyone could
  // authorize it; only an ALLOWED_LOGINS entry may ever get a session that can write to the repo.
  const userRes = await fetch(`${GH_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA },
  });
  const user = (await userRes.json()) as { login?: string };
  if (!isAllowedLogin(user.login, env.ALLOWED_LOGINS)) {
    return htmlError(`Sorry, @${user.login ?? 'unknown'} is not allowed to edit recipes.`, 403, CLEAR_AUTH_COOKIES);
  }

  // Mint an opaque session id; the GitHub token stays server-side in KV.
  const sessionId = crypto.randomUUID();
  const ttl = Number(env.SESSION_TTL) || 28800;
  const session: Session = { token };
  await env.SESSIONS.put(sessionId, JSON.stringify(session), { expirationTtl: ttl });

  // Return to whichever page started sign-in (re-validated against the allowlist, defensively).
  const returnTo = safeReturn(readCookie(request, 'oauth_return'));

  // Hand the session id back via the URL fragment — fragments aren't sent to servers or logged.
  // Also clear both the state and return cookies.
  const headers = new Headers({ Location: `${env.SITE_ORIGIN}${returnTo}#session=${sessionId}` });
  for (const cookie of CLEAR_AUTH_COOKIES) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

// ---- Session auth wrapper -------------------------------------------------

async function withSession(
  request: Request,
  env: Env,
  handler: (sessionId: string, session: Session) => Promise<Response>
): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const sessionId = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!sessionId) return json(env, 401, { error: 'Not signed in.' });

  const raw = await env.SESSIONS.get(sessionId);
  if (!raw) return json(env, 401, { error: 'Session expired. Please sign in again.' });

  return handler(sessionId, JSON.parse(raw) as Session);
}

async function logout(env: Env, sessionId: string): Promise<Response> {
  await env.SESSIONS.delete(sessionId);
  return json(env, 200, { ok: true });
}

// ---- Recipe proxy (create / update / delete) ------------------------------

// Resolve + validate the target path for a slug. Rejects anything that isn't a plain recipe
// slug, so a crafted request can never reach a file outside RECIPE_DIR.
function recipePath(env: Env, slug: unknown): string | null {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  return `${env.RECIPE_DIR}/${slug}.md`;
}

function contentsUrl(env: Env, path: string): string {
  return `${GH_API}/repos/${env.OWNER}/${env.REPO}/contents/${path}`;
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
  };
}

// Fetch the existing file's sha AND its decoded markdown (the Contents API returns both in one
// GET, so this costs no extra round-trip). Returns null if the file doesn't exist yet.
async function getExisting(
  env: Env,
  token: string,
  path: string
): Promise<{ sha: string; content: string } | null> {
  const res = await fetch(`${contentsUrl(env, path)}?ref=${env.BRANCH}`, { headers: ghHeaders(token) });
  if (res.status === 404) return null;
  if (res.status === 401) throw new ApiError(401, 'Your GitHub sign-in expired. Please sign in again.');
  if (!res.ok) throw new ApiError(502, `GitHub error ${res.status} while reading the recipe.`);
  const data = (await res.json()) as { sha: string; content?: string };
  return { sha: data.sha, content: data.content ? unb64(data.content) : '' };
}

// Send a create/update/delete to the GitHub Contents API. Resolves on success; throws an
// ApiError otherwise — 401 (dead token) is surfaced as-is so the client clears its session,
// anything else becomes a 502. Both mutation routes share this uniform translation.
async function commit(
  env: Env,
  token: string,
  method: 'PUT' | 'DELETE',
  path: string,
  payload: Record<string, unknown>,
  action: string
): Promise<void> {
  const res = await fetch(contentsUrl(env, path), {
    method,
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  if (res.status === 401) throw new ApiError(401, 'Your GitHub sign-in expired. Please sign in again.');
  const detail = await res.text();
  throw new ApiError(502, `GitHub rejected the ${action} (${res.status}). ${detail}`.trim());
}

// UTF-8 safe base64 for the file content GitHub's Contents API expects.
function b64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

// Inverse of b64 — GitHub returns file content as base64 with embedded newlines.
function unb64(b64str: string): string {
  const bin = atob(b64str.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Split a top-level frontmatter block into ordered { key, lines } entries. A key line starts a
// new entry; indented / list continuation lines belong to the entry above them.
function frontmatterEntries(fm: string): Array<{ key: string; lines: string[] }> {
  const entries: Array<{ key: string; lines: string[] }> = [];
  let cur: { key: string; lines: string[] } | null = null;
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+):/);
    if (m) {
      cur = { key: m[1], lines: [line] };
      entries.push(cur);
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  return entries;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

// Carry any unmodelled top-level frontmatter (e.g. `image`) from the old file into the freshly
// generated markdown, so editing through /upload never drops fields the form doesn't render.
function preserveUnmanaged(oldMarkdown: string, newMarkdown: string): string {
  const oldFm = oldMarkdown.match(FRONTMATTER_RE);
  const newFm = newMarkdown.match(FRONTMATTER_RE);
  if (!oldFm || !newFm) return newMarkdown;

  const newKeys = new Set(frontmatterEntries(newFm[1]).map((e) => e.key));
  const carried = frontmatterEntries(oldFm[1])
    .filter((e) => !MANAGED_FIELDS.has(e.key) && !newKeys.has(e.key))
    .flatMap((e) => e.lines);
  if (carried.length === 0) return newMarkdown;

  const merged = `---\n${newFm[1]}\n${carried.join('\n')}\n---\n`;
  // Function replacement so `$` in preserved values isn't treated as a capture reference.
  return newMarkdown.replace(FRONTMATTER_RE, () => merged);
}

async function putRecipe(request: Request, env: Env, session: Session): Promise<Response> {
  const body = (await request.json()) as {
    slug?: string;
    markdown?: string;
    message?: string;
    overwrite?: boolean;
    densities?: Record<string, unknown>;
  };
  const path = recipePath(env, body.slug);
  if (!path) return json(env, 400, { error: 'Invalid recipe slug.' });
  if (typeof body.markdown !== 'string' || !body.markdown) {
    return json(env, 400, { error: 'Missing recipe content.' });
  }

  const existing = await getExisting(env, session.token, path);
  // Guard against silently clobbering an existing recipe in add mode; edit mode passes overwrite.
  if (existing && !body.overwrite) {
    return json(env, 409, { error: 'A recipe already exists at that slug.', exists: true });
  }

  // On update, re-attach any frontmatter the form doesn't model (e.g. `image`) from the old file.
  const markdown = existing ? preserveUnmanaged(existing.content, body.markdown) : body.markdown;
  const payload: Record<string, unknown> = {
    message: body.message || `${existing ? 'Update' : 'Add'} recipe: ${body.slug}`,
    content: b64(markdown),
    branch: env.BRANCH,
  };
  if (existing) payload.sha = existing.sha;

  await commit(env, session.token, 'PUT', path, payload, 'commit');

  // Best-effort: fold any new ingredient → grams-per-cup ratios into the shared list, as a
  // second commit. This must never fail the recipe save, so errors are swallowed and reported
  // back as densitiesSaved:false — the uploader keeps the ratios and offers to retry.
  let densitiesSaved: boolean | undefined;
  if (body.densities && typeof body.densities === 'object') {
    densitiesSaved = await saveDensities(env, session.token, body.densities).catch(() => false);
  }

  return json(env, 200, { ok: true, created: !existing, ...(densitiesSaved !== undefined && { densitiesSaved }) });
}

// Merge client-supplied ingredient ratios into DENSITIES_PATH and commit if anything changed.
// The list is a flat JSON map of name (lowercased) → grams per US cup. Returns true if the file
// is up to date afterwards (including the no-change case), false if the commit couldn't happen.
async function saveDensities(env: Env, token: string, upserts: Record<string, unknown>): Promise<boolean> {
  const path = env.DENSITIES_PATH;
  if (!path) return false;

  // Sanitise: only accept non-empty names mapping to positive finite numbers.
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(upserts)) {
    const name = String(key).trim().toLowerCase();
    const num = Number(value);
    if (name && Number.isFinite(num) && num > 0) clean[name] = Math.round(num * 100) / 100;
  }
  if (Object.keys(clean).length === 0) return true;

  const existing = await getExisting(env, token, path);
  let current: Record<string, number> = {};
  if (existing?.content) {
    try {
      const parsed = JSON.parse(existing.content);
      if (parsed && typeof parsed === 'object') current = parsed as Record<string, number>;
    } catch {
      /* unreadable list — start from the upserts rather than clobbering blindly is riskier,
         so bail out and let it be reported as not-saved */
      return false;
    }
  }

  // Update existing entries in place and append new ones; preserving the file's existing key
  // order (rather than re-sorting) keeps the committed diff to just the lines that changed.
  let changed = false;
  for (const [name, ratio] of Object.entries(clean)) {
    if (current[name] !== ratio) {
      current[name] = ratio;
      changed = true;
    }
  }
  if (!changed) return true;

  const content = `${JSON.stringify(current, null, 2)}\n`;

  const payload: Record<string, unknown> = {
    message: 'Update ingredient densities',
    content: b64(content),
    branch: env.BRANCH,
  };
  if (existing) payload.sha = existing.sha;

  await commit(env, token, 'PUT', path, payload, 'densities commit');
  return true;
}

async function deleteRecipe(request: Request, env: Env, session: Session): Promise<Response> {
  const body = (await request.json()) as { slug?: string; message?: string };
  const path = recipePath(env, body.slug);
  if (!path) return json(env, 400, { error: 'Invalid recipe slug.' });

  const existing = await getExisting(env, session.token, path);
  if (!existing) return json(env, 404, { error: 'That recipe no longer exists.' });

  await commit(env, session.token, 'DELETE', path, {
    message: body.message || `Delete recipe: ${body.slug}`,
    sha: existing.sha,
    branch: env.BRANCH,
  }, 'delete');
  return json(env, 200, { ok: true });
}

// ---- Menu proxy (overwrite the single menu file) --------------------------

// Overwrite the cafe menu markdown. Unlike recipes there's no slug — the target is the fixed
// MENU_PATH — and it's always an overwrite (the file already exists), so we fetch its sha first.
// A cheap structural guard rejects payloads that don't look like a menu, so a malformed request
// can't blank out the file the order form / feed / LED sign all depend on.
async function putMenu(request: Request, env: Env, session: Session): Promise<Response> {
  let body: { markdown?: string; message?: string };
  try {
    body = (await request.json()) as { markdown?: string; message?: string };
  } catch {
    return json(env, 400, { error: 'Invalid JSON body.' });
  }
  const markdown = typeof body.markdown === 'string' ? body.markdown : '';
  // Cheap structural guard so a malformed payload can't blank the file. Tolerant of heading level
  // and case to match the site parser's wrapper detection (src/lib/cafe-menu.ts).
  if (!/^#{2,6}\s+menu\s*$/im.test(markdown)) {
    return json(env, 400, { error: 'Menu content looks malformed (missing a "## Menu" heading).' });
  }

  const existing = await getExisting(env, session.token, MENU_PATH);
  const payload: Record<string, unknown> = {
    message: body.message || 'Update cafe menu',
    content: b64(markdown),
    branch: env.BRANCH,
  };
  if (existing) payload.sha = existing.sha;

  await commit(env, session.token, 'PUT', MENU_PATH, payload, 'commit');
  return json(env, 200, { ok: true });
}

// ---- Small helpers --------------------------------------------------------

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function preflight(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function json(env: Env, status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

// Minimal HTML page for OAuth redirect errors (the browser lands here directly, not via fetch).
// Optional `cookies` are appended as Set-Cookie headers — callback failures pass CLEAR_AUTH_COOKIES.
function htmlError(message: string, status = 400, cookies: string[] = []): Response {
  const safe = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Sign-in error</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
      `<h1>Sign-in error</h1><p>${safe}</p><p><a href="/login">Try again</a></p></body>`,
    { status, headers }
  );
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
