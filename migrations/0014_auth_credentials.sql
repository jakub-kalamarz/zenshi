ALTER TABLE auth_users
  ADD COLUMN password_hash TEXT;

ALTER TABLE auth_users
  ADD COLUMN password_salt TEXT;

ALTER TABLE auth_users
  ADD COLUMN password_updated_at DATETIME;

ALTER TABLE mobile_oauth_states
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'signin';

ALTER TABLE mobile_oauth_states
  ADD COLUMN user_id TEXT;
