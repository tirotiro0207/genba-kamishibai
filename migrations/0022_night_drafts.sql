-- 夜間の下書きの走り手（062）。仕分けで「する」のページ → 取り出し → カードの下書き（1 ページに K 枚まで）→ 確かめる AI。
-- 1 行は (run_id, page, item)。item = -1 の行はそのページの取り出し、0 以上はそのページの何番目の決まりから作るカードか。
-- 走らせ直すと、済んだ行（done）は飛ばす。カードを作ったあと確かめる前に止まった行は、card_id があるので作り直さず確かめだけをやる
CREATE TABLE night_drafts (
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- どの仕分けの「する」のページから作ったか（night_runs の id）
  sort_run TEXT NOT NULL,
  page INTEGER NOT NULL,
  item INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'made', 'done', 'error')),
  extraction_id TEXT,
  card_id TEXT,
  band TEXT,
  dangerous INTEGER,
  rate INTEGER,
  usd REAL,
  ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, page, item)
);
