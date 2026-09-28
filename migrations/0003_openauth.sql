-- Sign-in now goes through OpenAuth, which issues its own access/refresh tokens.
DROP TABLE sessions;

-- OpenAuth's storage (signing keys, auth codes, refresh tokens), kept in
-- Postgres so the site needs no extra KV namespace.
CREATE TABLE openauth_storage (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ
);
CREATE INDEX openauth_storage_expires_at ON openauth_storage (expires_at) WHERE expires_at IS NOT NULL;
