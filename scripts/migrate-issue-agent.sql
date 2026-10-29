-- Existing databases: back up first, then pipe this file to psql (see README).
ALTER TABLE items ADD COLUMN IF NOT EXISTS agent_body text NOT NULL DEFAULT '';
