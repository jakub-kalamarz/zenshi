CREATE INDEX IF NOT EXISTS idx_gsc_sites_owner_enabled_url
  ON gsc_sites(owner_user_id, enabled, gsc_site_url);

CREATE INDEX IF NOT EXISTS idx_gsc_sync_log_site_status_date
  ON gsc_sync_log(site_id, status, date);

CREATE INDEX IF NOT EXISTS idx_gsc_queries_daily_site_date
  ON gsc_queries_daily(site_id, date);

CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_date_page_metrics
  ON gsc_pages_daily(site_id, date, page, clicks, impressions, position);

CREATE INDEX IF NOT EXISTS idx_gsc_queries_daily_site_date_query_metrics
  ON gsc_queries_daily(site_id, date, query, clicks, impressions, position);
