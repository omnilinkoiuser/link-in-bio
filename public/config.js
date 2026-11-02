// Connection details for the OmniLink backend.
// Both values come from Supabase > Project Settings > API. The anon key is
// designed to be public: the rules in supabase/schema.sql protect the data.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// Names people can't claim. Keep in sync with is_reserved_slug in supabase/schema.sql.
export const RESERVED_SLUGS = [
  "404", "abuse", "about", "account", "admin", "api", "app", "auth", "billing", "blog",
  "cloud", "config", "contact", "dashboard", "docs", "edit", "editor", "help", "home",
  "index", "legal", "login", "logout", "new", "official", "omnilink", "password", "pay",
  "privacy", "profile", "publish", "register", "report", "root", "security", "settings",
  "signin", "signup", "staff", "support", "system", "team", "templates", "terms", "user",
  "users", "verify", "www",
];
