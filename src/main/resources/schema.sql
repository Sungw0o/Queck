CREATE TABLE IF NOT EXISTS items (
    id         serial PRIMARY KEY,
    kind       text        NOT NULL CHECK (kind IN ('issue', 'page')),
    title      text        NOT NULL,
    body       text        NOT NULL DEFAULT '',
    agent_body text        NOT NULL DEFAULT '',
    status     text CHECK (status IN ('todo', 'doing', 'done')),
    prio       text CHECK (prio IN ('high', 'mid', 'low')),
    parent_id  int REFERENCES items ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
