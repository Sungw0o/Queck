CREATE TABLE IF NOT EXISTS items (
    id         serial PRIMARY KEY,
    kind       text        NOT NULL CHECK (kind IN ('issue', 'page')),
    title      text        NOT NULL,
    body       text        NOT NULL DEFAULT '',
    agent_body text        NOT NULL DEFAULT '',
    revision   int         NOT NULL DEFAULT 1 CHECK (revision > 0),
    page_type  text        NOT NULL DEFAULT 'note' CHECK (page_type IN ('note', 'source', 'wiki')),
    source_url text,
    content_hash text,
    status     text CHECK (status IN ('todo', 'doing', 'done')),
    prio       text CHECK (prio IN ('high', 'mid', 'low')),
    parent_id  int REFERENCES items ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- Plain column additions upgrade existing DBs at startup; '' means no project.
ALTER TABLE items ADD COLUMN IF NOT EXISTS project text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS items_source_hash ON items(content_hash) WHERE page_type = 'source';
CREATE UNIQUE INDEX IF NOT EXISTS items_source_url ON items(source_url) WHERE page_type = 'source' AND source_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS items_wiki_title ON items(lower(title)) WHERE page_type = 'wiki';

CREATE TABLE IF NOT EXISTS item_revisions (
    item_id int NOT NULL REFERENCES items ON DELETE CASCADE,
    revision int NOT NULL,
    snapshot jsonb NOT NULL,
    saved_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(item_id, revision)
);
CREATE TABLE IF NOT EXISTS item_links (
    from_id int NOT NULL REFERENCES items ON DELETE CASCADE,
    to_id int NOT NULL REFERENCES items ON DELETE CASCADE,
    relation text NOT NULL CHECK (relation IN ('source', 'related', 'issue', 'mention')),
    target_revision int NOT NULL,
    PRIMARY KEY(from_id, to_id, relation),
    CHECK (from_id <> to_id)
);
CREATE INDEX IF NOT EXISTS item_links_target ON item_links(to_id);
CREATE TABLE IF NOT EXISTS wiki_events (
    id serial PRIMARY KEY,
    item_id int REFERENCES items ON DELETE SET NULL,
    source_id int REFERENCES items ON DELETE SET NULL,
    action text NOT NULL,
    detail text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO item_revisions(item_id, revision, snapshot)
SELECT id, revision, to_jsonb(items) - 'content_hash' FROM items ON CONFLICT DO NOTHING;
