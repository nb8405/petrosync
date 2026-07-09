ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS csrf_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_refresh_token_hash
  ON user_sessions (refresh_token_hash)
  WHERE refresh_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_active
  ON user_sessions (refresh_token_hash, revoked_at, refresh_expires_at);
