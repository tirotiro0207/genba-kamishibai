-- 会社の言葉（085・§5 L1 ③）。テナントごとに、呼び方・言い換え・使わない言い方を積む。
-- 呼び方は用語表から（phrase = 日本語、prefer = ベトナム語）、言い換えは人の直しの差分から（phrase = 前、prefer = 後）、
-- 使わない言い方は直しで消された言い方（prefer は空）。hits は積んだ回数、last_card_id は最後に積んだカード
CREATE TABLE company_words (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL CHECK (kind IN ('call', 'rephrase', 'avoid')),
  phrase TEXT NOT NULL,
  prefer TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('glossary', 'edit')),
  hits INTEGER NOT NULL DEFAULT 1,
  last_card_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, kind, phrase, prefer)
);
