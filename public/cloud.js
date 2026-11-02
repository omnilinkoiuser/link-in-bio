import { SUPABASE_URL, SUPABASE_ANON_KEY, RESERVED_SLUGS } from "./config.js";

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const reservedSlugs = RESERVED_SLUGS;

let client = null;

async function db() {
  if (!client) {
    // Loaded only when someone publishes, so the editor stays fast
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

function fail(error) {
  if (error.code === "23505") throw new Error("That web address is taken. Try another one.");
  if (error.code === "23514") {
    throw new Error(
      /size/.test(error.message)
        ? "Your page is over the 2 MB limit. Use fewer or smaller images."
        : "That web address isn't available. Try another one.",
    );
  }
  throw new Error(error.message || "Something went wrong. Please try again.");
}

export async function getUser() {
  const { data } = await (await db()).auth.getSession();
  return data.session ? data.session.user : null;
}

export async function signUp(email, password) {
  const { data, error } = await (await db()).auth.signUp({ email, password });
  if (error) fail(error);
  return data.session ? data.user : null;
}

export async function signIn(email, password) {
  const { data, error } = await (await db()).auth.signInWithPassword({ email, password });
  if (error) fail(error);
  return data.user;
}

export async function signOut() {
  await (await db()).auth.signOut();
}

export async function sendPasswordReset(email) {
  const { error } = await (await db()).auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) fail(error);
}

export async function setPassword(password) {
  const { error } = await (await db()).auth.updateUser({ password });
  if (error) fail(error);
}

export async function getPage(user) {
  const { data, error } = await (await db())
    .from("profiles")
    .select("slug, state, published, blocked")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) fail(error);
  return data;
}

export async function publishPage(user, slug, state, html) {
  const { error } = await (await db())
    .from("profiles")
    .upsert({ user_id: user.id, slug, state, html, published: true }, { onConflict: "user_id" });
  if (error) fail(error);
}

export async function unpublishPage(user) {
  const { error } = await (await db()).from("profiles").update({ published: false }).eq("user_id", user.id);
  if (error) fail(error);
}
