const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS gsc_sites (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    gsc_site_url TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    enabled INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_sites_owner_url
    ON gsc_sites(owner_user_id, gsc_site_url);`,
  `CREATE TABLE IF NOT EXISTS gsc_pages_daily (
    site_id TEXT NOT NULL,
    date TEXT NOT NULL,
    page TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    synced_at DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (site_id, date, page)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_date
    ON gsc_pages_daily(site_id, date);`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_page
    ON gsc_pages_daily(site_id, page);`,
  `CREATE TABLE IF NOT EXISTS gsc_queries_daily (
    site_id TEXT NOT NULL,
    date TEXT NOT NULL,
    query TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    synced_at DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (site_id, date, query)
  );`,
  `CREATE TABLE IF NOT EXISTS gsc_page_device_daily (
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
  );`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_pages_daily_site_date_page_metrics
    ON gsc_pages_daily(site_id, date, page, clicks, impressions, position);`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_queries_daily_site_date_query_metrics
    ON gsc_queries_daily(site_id, date, query, clicks, impressions, position);`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_page_device_daily_site_date
    ON gsc_page_device_daily(site_id, date);`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_page_device_daily_site_date_device
    ON gsc_page_device_daily(site_id, date, device);`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_page_device_daily_site_page_device
    ON gsc_page_device_daily(site_id, page, device);`,
  `CREATE TABLE IF NOT EXISTS gsc_sync_state (
    site_id TEXT PRIMARY KEY,
    last_synced_date TEXT,
    backfill_cursor_date TEXT,
    status TEXT NOT NULL DEFAULT 'ok',
    error_message TEXT,
    active_run_id TEXT,
    active_run_state TEXT,
    active_run_started_at DATETIME,
    active_run_last_progress_at DATETIME,
    active_run_finished_at DATETIME,
    active_run_total_units INTEGER,
    active_run_processed_units INTEGER,
    active_run_warning_count INTEGER,
    active_run_error_count INTEGER,
    active_run_queue_position INTEGER,
    active_run_queue_delay_seconds INTEGER,
    active_run_data_fresh_through TEXT,
    active_run_current_unit TEXT,
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS gsc_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    date TEXT NOT NULL,
    rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok',
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_sync_log_site_date
    ON gsc_sync_log(site_id, date);`,
  `CREATE TABLE IF NOT EXISTS gsc_user_preferences (
    user_id TEXT PRIMARY KEY,
    compare_mode TEXT NOT NULL DEFAULT 'disabled',
    compare_show_previous_trend INTEGER NOT NULL DEFAULT 1,
    compare_match_weekdays INTEGER NOT NULL DEFAULT 1,
    compare_show_change_percent INTEGER NOT NULL DEFAULT 1,
    folder_open_values TEXT NOT NULL DEFAULT '[]',
    granularity TEXT NOT NULL DEFAULT 'day',
    range_preset TEXT,
    range_start TEXT,
    range_end TEXT,
    compare_range_start TEXT,
    compare_range_end TEXT,
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS gsc_folders (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'folder',
    color TEXT NOT NULL DEFAULT '#6b7280',
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_folders_owner_name
    ON gsc_folders(owner_user_id, name);`,
  `CREATE TABLE IF NOT EXISTS gsc_site_folders (
    site_id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_site_folders_folder
    ON gsc_site_folders(folder_id);`,
  `CREATE TABLE IF NOT EXISTS gsc_share_links (
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
  );`,
  `CREATE TABLE IF NOT EXISTS gsc_share_branding (
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
  );`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_share_owner_created
    ON gsc_share_links(owner_user_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_share_scope
    ON gsc_share_links(scope_type, scope_id);`,
  `CREATE INDEX IF NOT EXISTS idx_gsc_share_status_expiry
    ON gsc_share_links(status, expires_at);`,
]

let didEnsure = false
const SYNC_STATE_COLUMNS: Record<string, string> = {
  active_run_id: "TEXT",
  active_run_state: "TEXT",
  active_run_started_at: "DATETIME",
  active_run_last_progress_at: "DATETIME",
  active_run_finished_at: "DATETIME",
  active_run_total_units: "INTEGER",
  active_run_processed_units: "INTEGER",
  active_run_warning_count: "INTEGER",
  active_run_error_count: "INTEGER",
  active_run_queue_position: "INTEGER",
  active_run_queue_delay_seconds: "INTEGER",
  active_run_data_fresh_through: "TEXT",
  active_run_current_unit: "TEXT",
}
const REQUIRED_TABLES = [
  "gsc_sites",
  "gsc_pages_daily",
  "gsc_queries_daily",
  "gsc_page_device_daily",
  "gsc_sync_state",
  "gsc_sync_log",
  "gsc_user_preferences",
  "gsc_folders",
  "gsc_site_folders",
  "gsc_share_links",
  "gsc_share_branding",
]

export async function ensureGscSchema(env: CloudflareEnv) {
  if (didEnsure) return

  // Check whether all required tables exist to avoid redundant batch calls.
  try {
    const placeholders = REQUIRED_TABLES.map(() => "?").join(",")
    const tableCheck = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN (${placeholders})`,
    )
      .bind(...REQUIRED_TABLES)
      .first()
    const count = Number(tableCheck?.count ?? 0)
    if (count === REQUIRED_TABLES.length) {
      await ensureSyncStateColumns(env)
      didEnsure = true
      return
    }
  } catch {
    // Ignore error and proceed to ensure schema
  }

  const batch = schemaStatements.map((sql) => env.DB.prepare(sql))
  await env.DB.batch(batch)
  await ensureSyncStateColumns(env)
  didEnsure = true
}

async function ensureSyncStateColumns(env: CloudflareEnv) {
  try {
    const result = await env.DB.prepare("PRAGMA table_info(gsc_sync_state)").all<{
      name: string
    }>()
    const existing = new Set((result.results ?? []).map((column) => column.name))
    const missingStatements = Object.entries(SYNC_STATE_COLUMNS)
      .filter(([name]) => !existing.has(name))
      .map(([name, type]) =>
        env.DB.prepare(`ALTER TABLE gsc_sync_state ADD COLUMN ${name} ${type}`),
      )

    if (missingStatements.length > 0) {
      await env.DB.batch(missingStatements)
    }
  } catch {
    // Ignore schema introspection errors so read paths can proceed on fresh installs.
  }
}
