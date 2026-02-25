CREATE TABLE IF NOT EXISTS gsc_queries_daily (
  site_id TEXT NOT NULL,
  date TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, date, query)
);

CREATE INDEX IF NOT EXISTS idx_gsc_queries_daily_site_date
  ON gsc_queries_daily(site_id, date);

-- Reset sync state so backfill re-fetches data with query dimension
DELETE FROM gsc_sync_log;
UPDATE gsc_sync_state SET backfill_cursor_date = NULL, last_synced_date = NULL;
