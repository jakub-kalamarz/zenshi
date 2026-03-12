CREATE TABLE IF NOT EXISTS auth_relink_tokens (
  token_hash TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT,
  scope TEXT,
  provider_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_relink_tokens_target
  ON auth_relink_tokens(target_user_id);
