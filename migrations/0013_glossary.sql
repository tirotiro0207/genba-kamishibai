-- 用語表（036）。言葉の欄を作るたびに、カードに出る現場の言葉を日本語とベトナム語の組で積む。
-- 同じ日本語でもカードごとに 1 行（どのカードで使うか）。checked はベトナム語の分かる人が確かめた印
CREATE TABLE glossary (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  ja TEXT NOT NULL,
  vi TEXT NOT NULL,
  card_id TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, ja, card_id)
);
