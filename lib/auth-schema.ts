const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    image TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email
    ON auth_users(email);`,
  `CREATE TABLE IF NOT EXISTS auth_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
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
];

let didEnsure = false;

export async function ensureAuthSchema(env: CloudflareEnv) {
  if (didEnsure) return;
  for (const statement of schemaStatements) {
    await env.DB.prepare(statement).run();
  }
  didEnsure = true;
}
