-- OmniLink database. Only the Worker can reach it; nothing here is public directly.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- Set blocked to 1 to take a page down. Owners can't change it.
CREATE TABLE IF NOT EXISTS pages (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  html TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  blocked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Kept apart from pages because D1 limits each row to 2 MB
CREATE TABLE IF NOT EXISTS page_states (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  state TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS attempts_key_at ON attempts (key, at);
CREATE INDEX IF NOT EXISTS attempts_at ON attempts (at);
