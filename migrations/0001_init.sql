-- テナント（練習用・会社・架空の会社）。中身は 009 で足す
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('practice', 'company', 'demo')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
