CREATE TABLE IF NOT EXISTS gsc_page_device_daily (
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

CREATE INDEX IF NOT EXISTS idx_gsc_page_device_daily_site_date
  ON gsc_page_device_daily(site_id, date);

CREATE INDEX IF NOT EXISTS idx_gsc_page_device_daily_site_date_device
  ON gsc_page_device_daily(site_id, date, device);

CREATE INDEX IF NOT EXISTS idx_gsc_page_device_daily_site_page_device
  ON gsc_page_device_daily(site_id, page, device);
