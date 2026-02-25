CREATE TABLE IF NOT EXISTS gsc_sites (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  gsc_site_url TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_sites_owner_url
  ON gsc_sites(owner_user_id, gsc_site_url);

CREATE TABLE IF NOT EXISTS gsc_pages_daily (
  site_id TEXT NOT NULL,
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  device TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, date, page, device)
);

CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_date
  ON gsc_pages_daily(site_id, date);

CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_page
  ON gsc_pages_daily(site_id, page);

CREATE TABLE IF NOT EXISTS gsc_sync_state (
  site_id TEXT PRIMARY KEY,
  last_synced_date TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gsc_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  date TEXT NOT NULL,
  rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
