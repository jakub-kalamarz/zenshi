const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    image TEXT,
    password_hash TEXT,
    password_salt TEXT,
    password_updated_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email
    ON auth_users(email);`,
  `CREATE TABLE IF NOT EXISTS auth_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    image TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_type TEXT,
    scope TEXT,
    expires_at INTEGER,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_accounts_provider
    ON auth_accounts(provider, provider_account_id);`,
  `CREATE INDEX IF NOT EXISTS idx_auth_accounts_user
    ON auth_accounts(user_id);`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_token
    ON auth_sessions(session_token);`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions(user_id);`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    label TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    expires_at INTEGER,
    revoked_at DATETIME,
    last_used_at DATETIME
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash
    ON api_tokens(token_hash);`,
  `CREATE INDEX IF NOT EXISTS idx_api_tokens_user
    ON api_tokens(user_id);`,
  `CREATE TABLE IF NOT EXISTS mobile_login_codes (
    code_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    expires_at INTEGER NOT NULL,
    used_at DATETIME
  );`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_login_codes_user
    ON mobile_login_codes(user_id);`,
  `CREATE TABLE IF NOT EXISTS mobile_oauth_states (
    state TEXT PRIMARY KEY,
    verifier TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    expires_at INTEGER NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'signin',
    user_id TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS auth_relink_tokens (
    token_hash TEXT PRIMARY KEY,
    target_user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    image TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT,
    scope TEXT,
    provider_expires_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_auth_relink_tokens_target
    ON auth_relink_tokens(target_user_id);`,
];

let didEnsure = false;

export async function ensureAuthSchema(env: CloudflareEnv) {
  if (didEnsure) return;
  for (const statement of schemaStatements) {
    await env.DB.prepare(statement).run();
  }
  didEnsure = true;
}
