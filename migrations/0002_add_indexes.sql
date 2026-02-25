CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_date_device
  ON gsc_pages_daily(site_id, date, device);

CREATE INDEX IF NOT EXISTS idx_gsc_sync_log_site_date
  ON gsc_sync_log(site_id, date);
