CREATE TABLE IF NOT EXISTS gsc_folders (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_folders_owner_name
  ON gsc_folders(owner_user_id, name);

CREATE TABLE IF NOT EXISTS gsc_site_folders (
  site_id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gsc_site_folders_folder
  ON gsc_site_folders(folder_id);
