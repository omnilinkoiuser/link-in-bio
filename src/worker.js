import { RESERVED_SLUGS } from "../public/config.js";

const SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PAGE_BYTES = 1_900_000;
const SESSION_DAYS = 30;
const MINUTE = 60_000;
// The most Workers allows for PBKDF2. The count is stored with each hash so it can be raised later.
const PBKDF2_ITERATIONS = 100_000;

// Pages are written by members, so each one runs in a sandbox. It can't read the builder's
// data, submit forms or send data anywhere, even if someone edits its HTML by hand.
const PAGE_POLICY = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation allow-top-navigation-to-custom-protocols",
  "default-src 'none'",
  "img-src data: https:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "script-src 'unsafe-inline' https://www.youtube.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const encoder = new TextEncoder();
const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
const randomHex = (length) => toHex(crypto.getRandomValues(new Uint8Array(length)));
const sha256 = async (text) => toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
const byteLength = (text) => encoder.encode(text).length;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(await derive(password, salt, PBKDF2_ITERATIONS))}`;
}

async function checkPassword(password, stored) {
  const [, iterations, salt, hash] = stored.split("$");
  const actual = await derive(password, fromHex(salt), Number(iterations));
  return crypto.subtle.timingSafeEqual(actual, fromHex(hash).buffer);
}

async function rateLimited(db, key, max, windowMs) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE key = ? AND at > ?").bind(key, Date.now() - windowMs).first();
  return row.n >= max;
}

async function recordAttempt(db, key) {
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO attempts (key, at) VALUES (?, ?)").bind(key, now),
    db.prepare("DELETE FROM attempts WHERE at < ?").bind(now - 1440 * MINUTE),
  ]);
}

function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  // Limited to /api so it's never sent with a request for a member's page
  return `omni_session=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure}`;
}

async function startSession(request, db, userId) {
  const token = randomHex(32);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, now),
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), userId, now + SESSION_DAYS * 1440 * MINUTE),
  ]);
  return { "Set-Cookie": sessionCookie(request, token, SESSION_DAYS * 86400) };
}

const sessionToken = (request) => (request.headers.get("Cookie") || "").match(/(?:^|;\s*)omni_session=([0-9a-f]{64})/)?.[1];

async function currentUser(request, db) {
  const token = sessionToken(request);
  if (!token) return null;
  return db
    .prepare("SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?")
    .bind(await sha256(token), Date.now())
    .first();
}

async function requireUser(request, db) {
  const user = await currentUser(request, db);
  if (!user) throw new ApiError(401, "Please sign in again.");
  return user;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "That request couldn't be read.");
  }
}

function readCredentials(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!EMAIL.test(email) || email.length > 254) throw new ApiError(400, "Enter a valid email address.");
  if (password.length < 8 || password.length > 200) throw new ApiError(400, "Use a password with at least 8 characters.");
  return { email, password };
}

const pageSummary = (db, userId) => db.prepare("SELECT slug, published, blocked FROM pages WHERE user_id = ?").bind(userId).first();

async function signUp(request, db) {
  const ipKey = `signup:${await sha256(request.headers.get("CF-Connecting-IP") || "local")}`;
  if (await rateLimited(db, ipKey, 10, 60 * MINUTE)) throw new ApiError(429, "Too many new accounts from here. Try again later.");
  const { email, password } = readCredentials(await readBody(request));
  await recordAttempt(db, ipKey);

  const id = crypto.randomUUID();
  try {
    await db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(id, email, await hashPassword(password), Date.now()).run();
  } catch (error) {
    if (/UNIQUE/.test(error.message)) throw new ApiError(409, "That email already has an account. Try signing in.");
    throw error;
  }
  return json({ user: { id, email } }, 201, await startSession(request, db, id));
}

async function signIn(request, db) {
  const body = await readBody(request);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const emailKey = `login:${await sha256(email)}`;
  const ipKey = `login-ip:${await sha256(request.headers.get("CF-Connecting-IP") || "local")}`;
  if ((await rateLimited(db, emailKey, 10, 15 * MINUTE)) || (await rateLimited(db, ipKey, 50, 15 * MINUTE))) {
    throw new ApiError(429, "Too many tries. Wait 15 minutes and try again.");
  }

  const user = await db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind(email).first();
  if (!user || !(await checkPassword(password, user.password_hash))) {
    await Promise.all([recordAttempt(db, emailKey), recordAttempt(db, ipKey)]);
    throw new ApiError(401, "That email or password isn't right.");
  }
  return json({ user: { id: user.id, email: user.email } }, 200, await startSession(request, db, user.id));
}

async function signOut(request, db) {
  const token = sessionToken(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
}

async function savePage(request, db) {
  const user = await requireUser(request, db);
  const { slug, state, html } = await readBody(request);
  if (typeof slug !== "string" || !SLUG.test(slug)) throw new ApiError(400, "Your web address needs 3 to 30 letters, numbers or dashes.");
  if (RESERVED_SLUGS.includes(slug)) throw new ApiError(400, "That web address isn't available. Try another one.");
  if (typeof html !== "string" || !state || typeof state !== "object") throw new ApiError(400, "That page couldn't be read.");

  const stateText = JSON.stringify(state);
  if (byteLength(html) > MAX_PAGE_BYTES || byteLength(stateText) > MAX_PAGE_BYTES) throw new ApiError(413, "Your page is too large. Use fewer or smaller images.");

  const existing = await pageSummary(db, user.id);
  if (existing && existing.blocked) throw new ApiError(403, "This page was taken down for breaking the rules, so it can't be published.");

  try {
    await db.batch([
      db
        .prepare("INSERT INTO pages (user_id, slug, html, published, updated_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT (user_id) DO UPDATE SET slug = excluded.slug, html = excluded.html, published = 1, updated_at = excluded.updated_at")
        .bind(user.id, slug, html, Date.now()),
      db
        .prepare("INSERT INTO page_states (user_id, state) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET state = excluded.state")
        .bind(user.id, stateText),
    ]);
  } catch (error) {
    if (/UNIQUE/.test(error.message)) throw new ApiError(409, "That web address is taken. Try another one.");
    throw error;
  }
  return json({ page: { slug, published: 1, blocked: 0 } });
}

async function loadPage(request, db) {
  const user = await requireUser(request, db);
  const page = await pageSummary(db, user.id);
  if (!page) return json({ page: null });
  const row = await db.prepare("SELECT state FROM page_states WHERE user_id = ?").bind(user.id).first();
  return json({ page: { ...page, state: row ? JSON.parse(row.state) : null } });
}

async function takeOffline(request, db) {
  const user = await requireUser(request, db);
  await db.prepare("UPDATE pages SET published = 0, updated_at = ? WHERE user_id = ?").bind(Date.now(), user.id).run();
  return json({ ok: true });
}

async function me(request, db) {
  const user = await currentUser(request, db);
  return json({ user, page: user ? await pageSummary(db, user.id) : null });
}

const ROUTES = {
  "GET /api/me": me,
  "POST /api/signup": signUp,
  "POST /api/login": signIn,
  "POST /api/logout": signOut,
  "GET /api/page": loadPage,
  "PUT /api/page": savePage,
  "POST /api/page/offline": takeOffline,
};

async function handleApi(request, env, url) {
  const route = ROUTES[`${request.method} ${url.pathname}`];
  if (!route) return json({ error: "Not found." }, 404);
  // Blocks other sites, and members' sandboxed pages, from acting as a signed-in person
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return json({ error: "That request wasn't allowed." }, 403);
  try {
    return await route(request, env.DB);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

const messagePage = (status, title, text) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><body style="margin:0;padding:64px 24px;background:#fff;color:#0b0b0b;font:500 14px/1.45 system-ui,sans-serif"><h1 style="margin:0 0 8px;font-size:28px;line-height:1.1">${title}</h1><p style="margin:0 0 16px">${text}</p><a href="/" style="color:inherit">Make your own page</a></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

async function servePage(env, slug) {
  let page;
  try {
    page = await env.DB.prepare("SELECT html FROM pages WHERE slug = ? AND published = 1 AND blocked = 0").bind(slug).first();
  } catch (error) {
    console.error(error);
    return messagePage(503, "This page can't load right now", "Please try again in a minute.");
  }
  if (!page) return messagePage(404, "No page here yet", "This address is free, or its page has been taken offline.");
  return new Response(page.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PAGE_POLICY,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "public, max-age=60",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);

    const name = decodeURIComponent(url.pathname).match(/^\/([^/]+)\/?$/)?.[1];
    const slug = name && name.toLowerCase();
    if (["GET", "HEAD"].includes(request.method) && slug && SLUG.test(slug) && !RESERVED_SLUGS.includes(slug)) {
      if (name !== slug) return Response.redirect(new URL(`/${slug}`, url).toString(), 301);
      return servePage(env, slug);
    }
    return env.ASSETS.fetch(request);
  },
};
