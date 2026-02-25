CREATE TABLE IF NOT EXISTS gsc_user_preferences (
  user_id TEXT PRIMARY KEY,
  compare_mode TEXT NOT NULL DEFAULT 'disabled',
  compare_show_previous_trend INTEGER NOT NULL DEFAULT 1,
  compare_match_weekdays INTEGER NOT NULL DEFAULT 1,
  compare_show_change_percent INTEGER NOT NULL DEFAULT 1,
  granularity TEXT NOT NULL DEFAULT 'day',
  range_preset TEXT,
  range_start TEXT,
  range_end TEXT,
  compare_range_start TEXT,
  compare_range_end TEXT,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
