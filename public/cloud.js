import { RESERVED_SLUGS } from "./config.js";

export const reservedSlugs = RESERVED_SLUGS;

async function call(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

// Accounts only work where the site's server is running. Anywhere else, the builder
// falls back to its copy-the-code publishing steps.
const probe = await fetch("/api/me").catch(() => null);
export const configured = Boolean(probe && probe.ok && /json/.test(probe.headers.get("Content-Type") || ""));

export const getUser = async () => (await call("GET", "/api/me")).user;
export const signUp = async (email, password) => (await call("POST", "/api/signup", { email, password })).user;
export const signIn = async (email, password) => (await call("POST", "/api/login", { email, password })).user;
export const signOut = () => call("POST", "/api/logout");
export const getPage = async () => (await call("GET", "/api/page")).page;
export const publishPage = (user, slug, state, html) => call("PUT", "/api/page", { slug, state, html });
export const unpublishPage = () => call("POST", "/api/page/offline");
