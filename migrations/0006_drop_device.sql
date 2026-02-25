-- Drop the old table with device column and recreate without it
DROP TABLE IF EXISTS gsc_pages_daily;

CREATE TABLE gsc_pages_daily (
  site_id TEXT NOT NULL,
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, date, page)
);

CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_date
  ON gsc_pages_daily(site_id, date);

CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_page
  ON gsc_pages_daily(site_id, page);

-- Reset sync state so backfill re-fetches all data without device
DELETE FROM gsc_sync_log;
UPDATE gsc_sync_state SET backfill_cursor_date = NULL, last_synced_date = NULL;
