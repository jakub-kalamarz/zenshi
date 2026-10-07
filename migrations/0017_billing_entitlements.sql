CREATE TABLE IF NOT EXISTS billing_entitlements (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  entitlement_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  product_id TEXT,
  expires_at TEXT,
  last_checked_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider, entitlement_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_active
  ON billing_entitlements(user_id, active);
