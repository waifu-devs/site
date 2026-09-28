-- Users are created on first GitHub login. github_id is the stable identity;
-- username tracks the GitHub login and is refreshed on every sign-in.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  pronouns TEXT,
  website TEXT,
  favorite_waifu TEXT,
  theme_id TEXT NOT NULL DEFAULT 'sakura',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Session tokens are stored hashed (SHA-256); the raw token only lives in the cookie.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX sessions_user_id ON sessions(user_id);

-- Community-made themes. Built-in themes live in code (lib/themes.ts).
CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  colors TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX themes_owner_id ON themes(owner_id);
CREATE INDEX themes_public_created ON themes(is_public, created_at DESC);
