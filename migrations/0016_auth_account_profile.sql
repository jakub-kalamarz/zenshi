ALTER TABLE auth_accounts ADD COLUMN email TEXT;
ALTER TABLE auth_accounts ADD COLUMN name TEXT;
ALTER TABLE auth_accounts ADD COLUMN image TEXT;

ALTER TABLE auth_relink_tokens ADD COLUMN email TEXT;
ALTER TABLE auth_relink_tokens ADD COLUMN name TEXT;
ALTER TABLE auth_relink_tokens ADD COLUMN image TEXT;
