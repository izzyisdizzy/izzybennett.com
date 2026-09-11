/**
 * Recipe API — Cloudflare Worker that turns the pasted-PAT flow on /upload into a proper
 * "Sign in with GitHub" OAuth flow, WITHOUT ever handing a GitHub token to the browser.
 *
 * Flow:
 *   GET  /login        → 302 to GitHub's OAuth consent screen (state stored in a cookie)
 *   GET  /callback     → exchange code→token (uses the client secret), look up who they are,
 *                        verify they're a listed editor, mint an opaque session id, stash
 *                        {login,userId} in KV, then 302 back to the site with the session id
 *                        in the URL fragment.
 *   POST   /api/recipe → create/update a recipe file (auth: `Authorization: Bearer <session>`)
 *   DELETE /api/recipe → delete a recipe file
 *   POST   /api/menu   → overwrite the cafe menu file (auth: `Authorization: Bearer <session>`)
 *   POST   /logout     → destroy the session
 *
 * Two separate GitHub identities are in play, and keeping them straight is the whole design:
 *
 *   - The OAuth App answers "who is this?" and NOTHING else. Its token is discarded the moment
 *     the login is read, so no user credential is ever stored.
 *   - The GitHub App does every write, as itself. Editors therefore need no repo access of their
 *     own — which is what stops a recipe editor from touching anything but recipes, since the
 *     only way to reach the repo at all is through this worker's capability-checked routes.
 *
 * The browser only ever holds the opaque session id; KV holds only {login,userId}. Every proxied
 * call is hard-restricted to RECIPE_DIR/<slug>.md, DENSITIES_PATH, or the single fixed MENU_PATH
 * on OWNER/REPO@BRANCH — so a leaked session can only ever touch those files, and only the ones
 * its capabilities allow.
 */

export interface Env {
  SESSIONS: KVNamespace;
  // Secrets (wrangler secret put):
  GITHUB_CLIENT_SECRET: string;
  GITHUB_APP_PRIVATE_KEY: string;
  // Vars (wrangler.toml [vars]):
  GITHUB_CLIENT_ID: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  RECIPE_EDITORS: string;
  ADMIN_LOGINS: string;
  OWNER: string;
  REPO: string;
  BRANCH: string;
  RECIPE_DIR: string;
  DENSITIES_PATH: string;
  SITE_ORIGIN: string;
  SESSION_TTL: string;
}

// What a signed-in session is allowed to do. `recipes` covers the recipe files and the shared
// ingredient-density list the uploader grows; `admin` additionally covers the cafe menu and the
// kitchen open/close toggle that gates on /api/me.
type Capability = 'recipes' | 'admin';

// A session deliberately holds NO GitHub credential — just who the user is. Writes go through
// the GitHub App installation token instead, so a leaked session can't be replayed against
// GitHub, only against this worker's own (capability-checked, path-restricted) routes.
interface Session {
  login: string;
  userId: number;
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

// Parse a comma-separated login list. Compared case-insensitively, since GitHub logins are
// case-preserving but not case-sensitive. Empty entries are dropped, so a blank or comma-only
// var yields an empty set and fails closed rather than matching a stray "".
const loginSet = (list: string): Set<string> =>
  new Set(
    (list ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== '')
  );

// Resolve a GitHub login to its capabilities. ADMIN_LOGINS implies recipe access too, so an
// admin doesn't have to be listed twice. An unknown login gets an empty array — no session.
function capabilitiesFor(login: string | undefined, env: Env): Capability[] {
  if (!login) return [];
  const target = login.toLowerCase();
  const caps: Capability[] = [];
  const isAdmin = loginSet(env.ADMIN_LOGINS).has(target);
  if (isAdmin || loginSet(env.RECIPE_EDITORS).has(target)) caps.push('recipes');
  if (isAdmin) caps.push('admin');
  return caps;
}

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
          return await withSession(request, env, 'recipes', (_id, s) => putRecipe(request, env, s));
        case 'DELETE /api/recipe':
          return await withSession(request, env, 'recipes', (_id, s) => deleteRecipe(request, env, s));
        case 'POST /api/menu':
          // The cafe menu feeds the order form, /izzys-cafe.json and the LED sign, so it's
          // admin-only — recipe editors can't reach it.
          return await withSession(request, env, 'admin', (_id, s) => putMenu(request, env, s));
        case 'POST /logout':
          return await withSession(request, env, null, (id) => logout(env, id));
        case 'GET /api/me':
          // Identity + capability check for the site and for other first-party backends (the Pi
          // order server gates its kitchen open/close toggle on this). Callers must check
          // `admin` — a bare 200 now only means "signed in", not "allowed to do anything".
          return await withSession(request, env, null, async (_id, s, caps) =>
            json(env, 200, { ok: true, login: s.login, capabilities: caps, admin: caps.includes('admin') })
          );
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
  // authorize it; only a listed editor may ever get a session.
  const userRes = await fetch(`${GH_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA },
  });
  const user = (await userRes.json()) as { login?: string; id?: number };
  if (capabilitiesFor(user.login, env).length === 0 || typeof user.id !== 'number') {
    return htmlError(`Sorry, @${user.login ?? 'unknown'} is not allowed to edit recipes.`, 403, CLEAR_AUTH_COOKIES);
  }

  // Mint an opaque session id. The user's GitHub token is deliberately NOT kept — it was only
  // ever needed to answer "who is this?", and writes go out as the App. Nothing in KV can be
  // replayed against GitHub. Capabilities are re-resolved per request from the live config, so
  // revoking someone takes effect on their next call rather than whenever their session lapses.
  const sessionId = crypto.randomUUID();
  const ttl = Number(env.SESSION_TTL) || 28800;
  const session: Session = { login: user.login as string, userId: user.id };
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

// Session ids are crypto.randomUUID(). Requiring that shape means a Bearer header can only ever
// address a session — never another KV entry this worker keeps (e.g. the installation token).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `required` is the capability this route needs, or null for "any valid session" (logout, /api/me).
// Capabilities are recomputed from config on every request rather than baked into the session, so
// removing someone from RECIPE_EDITORS locks them out immediately instead of at session expiry.
async function withSession(
  request: Request,
  env: Env,
  required: Capability | null,
  handler: (sessionId: string, session: Session, caps: Capability[]) => Promise<Response>
): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const sessionId = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!sessionId || !UUID_RE.test(sessionId)) return json(env, 401, { error: 'Not signed in.' });

  const raw = await env.SESSIONS.get(sessionId);
  if (!raw) return json(env, 401, { error: 'Session expired. Please sign in again.' });

  const session = JSON.parse(raw) as Session;
  if (!session?.login) return json(env, 401, { error: 'Session expired. Please sign in again.' });

  const caps = capabilitiesFor(session.login, env);
  if (caps.length === 0) return json(env, 403, { error: 'Your access has been removed.' });
  if (required && !caps.includes(required)) {
    return json(env, 403, { error: `@${session.login} isn't allowed to do that.` });
  }

  return handler(sessionId, session, caps);
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

// ---- GitHub App installation token ----------------------------------------

// Every write goes out as the GitHub App, never as the signed-in user — so an editor needs no
// repo access of their own, and can't reach anything this worker doesn't explicitly expose.
// The App is installed on OWNER/REPO with Contents: read & write, so its reach is bounded by
// the installation, and within that by recipePath()/MENU_PATH.
//
// Installation tokens last an hour. We cache one in KV and re-mint shortly before expiry. The
// cache key is deliberately not UUID-shaped, and withSession only accepts UUID session ids, so
// this entry can never be pulled out through an `Authorization: Bearer` header.
const INSTALLATION_TOKEN_KEY = 'installation-token::v1';
const TOKEN_SKEW_MS = 5 * 60 * 1000;

async function installationToken(env: Env): Promise<string> {
  const cached = await env.SESSIONS.get(INSTALLATION_TOKEN_KEY);
  if (cached) {
    const { token, expiresAt } = JSON.parse(cached) as { token?: string; expiresAt?: number };
    if (token && typeof expiresAt === 'number' && expiresAt - TOKEN_SKEW_MS > Date.now()) return token;
  }

  const res = await fetch(`${GH_API}/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`, {
    method: 'POST',
    headers: ghHeaders(await appJwt(env)),
  });
  if (!res.ok) throw new ApiError(502, `Could not authenticate as the GitHub App (${res.status}).`);

  const data = (await res.json()) as { token?: string; expires_at?: string };
  if (!data.token) throw new ApiError(502, 'GitHub returned no installation token.');

  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : Date.now() + 3_600_000;
  // Expire the cache entry ahead of the token itself, so a stale read is impossible.
  const ttl = Math.max(60, Math.floor((expiresAt - TOKEN_SKEW_MS - Date.now()) / 1000));
  await env.SESSIONS.put(INSTALLATION_TOKEN_KEY, JSON.stringify({ token: data.token, expiresAt }), {
    expirationTtl: ttl,
  });
  return data.token;
}

// The short-lived RS256 JWT that proves we are the App. GitHub caps these at 10 minutes; we use
// 9. This is the only thing the private key is ever used for — it's exchanged immediately for an
// installation token, and that token is what actually touches the repo.
async function appJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  // `iat` is backdated 60s to absorb clock skew between us and GitHub, per GitHub's guidance.
  const payload = { iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

  const key = await importAppKey(env.GITHUB_APP_PRIVATE_KEY);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlBytes(new Uint8Array(sig))}`;
}

// GitHub issues App keys as PKCS#1 ("BEGIN RSA PRIVATE KEY"), but WebCrypto only imports PKCS#8
// ("BEGIN PRIVATE KEY"). Rather than require an `openssl pkcs8` step during setup — easy to skip
// and confusing to debug — accept either and wrap PKCS#1 in the PKCS#8 envelope here.
async function importAppKey(pem: string): Promise<CryptoKey> {
  const body = (pem ?? '').replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
  if (!body) throw new ApiError(500, 'GITHUB_APP_PRIVATE_KEY is missing or malformed.');
  let der = base64ToBytes(body);
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) der = pkcs1ToPkcs8(der);
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

// Just enough DER to build a PKCS#8 envelope around an existing PKCS#1 key body.
function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return [0x80 | bytes.length, ...bytes];
}

function derWrap(tag: number, contents: Uint8Array): Uint8Array {
  const prefix = [tag, ...derLength(contents.length)];
  const out = new Uint8Array(prefix.length + contents.length);
  out.set(prefix, 0);
  out.set(contents, prefix.length);
  return out;
}

// PrivateKeyInfo ::= SEQUENCE { version INTEGER 0, AlgorithmIdentifier, privateKey OCTET STRING },
// with algorithm = rsaEncryption (1.2.840.113549.1.1.1) and NULL parameters.
const PKCS8_RSA_PREAMBLE = new Uint8Array([
  0x02, 0x01, 0x00,
  0x30, 0x0d,
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
]);

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const keyOctet = derWrap(0x04, pkcs1);
  const body = new Uint8Array(PKCS8_RSA_PREAMBLE.length + keyOctet.length);
  body.set(PKCS8_RSA_PREAMBLE, 0);
  body.set(keyOctet, PKCS8_RSA_PREAMBLE.length);
  return derWrap(0x30, body);
}

// Attribute the commit to the person who made it, even though the App is the committer — so the
// repo history still reads "Rachel added a recipe", not "izzy-recipe-bot did everything".
function commitAuthor(session: Session): { name: string; email: string } {
  return {
    name: session.login,
    email: `${session.userId}+${session.login}@users.noreply.github.com`,
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
  // 401/403 here is the App installation, not the user — their session is fine, so don't tell
  // them to sign in again. Surface it as a server-side problem instead.
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(502, 'The recipe app lost access to GitHub. Check the GitHub App installation.');
  }
  if (!res.ok) throw new ApiError(502, `GitHub error ${res.status} while reading the recipe.`);
  const data = (await res.json()) as { sha: string; content?: string };
  return { sha: data.sha, content: data.content ? unb64(data.content) : '' };
}

// Send a create/update/delete to the GitHub Contents API. Resolves on success; throws an
// ApiError otherwise. Everything becomes a 502: the caller's own session is known-good by this
// point (withSession checked it), so any GitHub rejection here is a server-side problem with the
// App installation, not something the user can fix by signing in again.
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
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(502, 'The recipe app lost access to GitHub. Check the GitHub App installation.');
  }
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

function base64ToBytes(b64str: string): Uint8Array {
  const bin = atob(b64str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// base64url (no padding) — the encoding JWT segments use.
const b64url = (str: string): string => b64urlBytes(new TextEncoder().encode(str));

function b64urlBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

  const token = await installationToken(env);
  const existing = await getExisting(env, token, path);
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
    author: commitAuthor(session),
  };
  if (existing) payload.sha = existing.sha;

  await commit(env, token, 'PUT', path, payload, 'commit');

  // Best-effort: fold any new ingredient → grams-per-cup ratios into the shared list, as a
  // second commit. This must never fail the recipe save, so errors are swallowed and reported
  // back as densitiesSaved:false — the uploader keeps the ratios and offers to retry.
  let densitiesSaved: boolean | undefined;
  if (body.densities && typeof body.densities === 'object') {
    densitiesSaved = await saveDensities(env, token, session, body.densities).catch(() => false);
  }

  return json(env, 200, { ok: true, created: !existing, ...(densitiesSaved !== undefined && { densitiesSaved }) });
}

// Merge client-supplied ingredient ratios into DENSITIES_PATH and commit if anything changed.
// The list is a flat JSON map of name (lowercased) → grams per US cup. Returns true if the file
// is up to date afterwards (including the no-change case), false if the commit couldn't happen.
async function saveDensities(
  env: Env,
  token: string,
  session: Session,
  upserts: Record<string, unknown>
): Promise<boolean> {
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
    author: commitAuthor(session),
  };
  if (existing) payload.sha = existing.sha;

  await commit(env, token, 'PUT', path, payload, 'densities commit');
  return true;
}

async function deleteRecipe(request: Request, env: Env, session: Session): Promise<Response> {
  const body = (await request.json()) as { slug?: string; message?: string };
  const path = recipePath(env, body.slug);
  if (!path) return json(env, 400, { error: 'Invalid recipe slug.' });

  const token = await installationToken(env);
  const existing = await getExisting(env, token, path);
  if (!existing) return json(env, 404, { error: 'That recipe no longer exists.' });

  await commit(env, token, 'DELETE', path, {
    message: body.message || `Delete recipe: ${body.slug}`,
    sha: existing.sha,
    branch: env.BRANCH,
    author: commitAuthor(session),
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

  const token = await installationToken(env);
  const existing = await getExisting(env, token, MENU_PATH);
  const payload: Record<string, unknown> = {
    message: body.message || 'Update cafe menu',
    content: b64(markdown),
    branch: env.BRANCH,
    author: commitAuthor(session),
  };
  if (existing) payload.sha = existing.sha;

  await commit(env, token, 'PUT', MENU_PATH, payload, 'commit');
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
