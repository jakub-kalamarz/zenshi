CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  label TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER,
  revoked_at DATETIME,
  last_used_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash
  ON api_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user
  ON api_tokens(user_id);

CREATE TABLE IF NOT EXISTS mobile_login_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL,
  used_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_mobile_login_codes_user
  ON mobile_login_codes(user_id);

CREATE TABLE IF NOT EXISTS mobile_oauth_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);
