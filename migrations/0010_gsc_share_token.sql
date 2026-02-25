-- Add token column to gsc_share_links to allow owner to re-copy the link
ALTER TABLE gsc_share_links ADD COLUMN token TEXT;
