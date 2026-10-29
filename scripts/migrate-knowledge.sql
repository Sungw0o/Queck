-- Run only after quack backup succeeds. Existing content is preserved.
ALTER TABLE items ADD COLUMN IF NOT EXISTS revision int NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE items ADD COLUMN IF NOT EXISTS page_type text NOT NULL DEFAULT 'note' CHECK (page_type IN ('note', 'source', 'wiki'));
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS content_hash text;
-- Then run schema.sql for indexes, history, links, logs and the initial snapshots.
