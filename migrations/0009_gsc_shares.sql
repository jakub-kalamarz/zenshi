CREATE TABLE IF NOT EXISTS gsc_share_links (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  revoked_at DATETIME,
  last_accessed_at DATETIME,
  default_start TEXT,
  default_end TEXT,
  default_compare_mode TEXT NOT NULL DEFAULT 'disabled',
  default_compare_start TEXT,
  default_compare_end TEXT,
  default_granularity TEXT NOT NULL DEFAULT 'day'
);

CREATE TABLE IF NOT EXISTS gsc_share_branding (
  share_id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL,
  logo_url TEXT,
  favicon_url TEXT,
  accent_color TEXT NOT NULL,
  header_bg_color TEXT,
  text_color TEXT,
  show_powered_by INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gsc_share_owner_created
  ON gsc_share_links(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gsc_share_scope
  ON gsc_share_links(scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_gsc_share_status_expiry
  ON gsc_share_links(status, expires_at);
