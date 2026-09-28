-- Users are created on first GitHub login. github_id is the stable identity;
-- username tracks the GitHub login and is refreshed on every sign-in.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  pronouns TEXT,
  website TEXT,
  favorite_waifu TEXT,
  theme_id TEXT NOT NULL DEFAULT 'sakura',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- GitHub logins are case-insensitive.
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

-- Session tokens are stored hashed (SHA-256); the raw token only lives in the cookie.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id ON sessions (user_id);
CREATE INDEX sessions_expires_at ON sessions (expires_at);

-- Community-made themes. Built-in themes live in code (lib/themes.ts).
CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  colors JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX themes_owner_id ON themes (owner_id);
CREATE INDEX themes_public_created ON themes (created_at DESC) WHERE is_public;
