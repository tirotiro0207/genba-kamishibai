-- 夜間の走り手（023）。資料を 1 ページずつ仕分け、進み具合をここに置く。
-- 走らせ直すと、済んだページ（done）は飛ばして続きから。ページは (run_id, page) で 1 行なので、同じページを二重に作らない
CREATE TABLE night_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  doc TEXT NOT NULL,
  pages INTEGER NOT NULL,
  -- 何回走らせ直したか（1 回目は 0）
  resumes INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE night_pages (
  run_id TEXT NOT NULL REFERENCES night_runs(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  page INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'error')),
  -- 仕分けの答え: 1 = カードにする、0 = しない
  card INTEGER,
  reason TEXT,
  usd REAL,
  ms INTEGER,
  session_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, page)
);
