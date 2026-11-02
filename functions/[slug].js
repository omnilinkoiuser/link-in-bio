import { SUPABASE_URL, SUPABASE_ANON_KEY, RESERVED_SLUGS } from "../public/config.js";

const SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

// Pages are written by members, so each one runs in a sandbox. It can't read the builder's
// sign-in session, submit forms or send data anywhere, even if someone edits its HTML by hand.
const PAGE_POLICY = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation",
  "default-src 'none'",
  "img-src data: https:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "script-src 'unsafe-inline' https://www.youtube.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const messagePage = (status, title, text) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><body style="margin:0;padding:64px 24px;background:#fff;color:#0b0b0b;font:500 14px/1.45 system-ui,sans-serif"><h1 style="margin:0 0 8px;font-size:28px;line-height:1.1">${title}</h1><p style="margin:0 0 16px">${text}</p><a href="/" style="color:inherit">Make your own page</a></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export async function onRequest({ request, params, env, next }) {
  const slug = String(params.slug);
  const lower = slug.toLowerCase();
  const url = env.SUPABASE_URL || SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

  // Everything else, such as /terms or /config.js, is a normal file
  if (!["GET", "HEAD"].includes(request.method) || !url || !SLUG.test(lower) || RESERVED_SLUGS.includes(lower)) {
    return next();
  }

  if (slug !== lower) {
    return Response.redirect(new URL(`/${lower}`, request.url).toString(), 301);
  }

  const response = await fetch(
    `${url}/rest/v1/profiles?slug=eq.${lower}&published=eq.true&blocked=eq.false&select=html&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  ).catch(() => null);

  if (!response || !response.ok) {
    return messagePage(503, "This page can't load right now", "Please try again in a minute.");
  }

  const [page] = await response.json();
  if (!page) {
    return messagePage(404, "No page here yet", "This address is free, or its page has been taken offline.");
  }

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
