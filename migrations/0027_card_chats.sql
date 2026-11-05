-- 新しいカードを作るチャット（11/5 作者）。添付した資料の文字と、作る人の指示と、取り出しの結果をやりとりの順に残す
CREATE TABLE card_chats (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  actor TEXT NOT NULL,
  -- やりとり（JSON の配列。user は指示と添付の名前、assistant は返事と取り出しの番号）
  messages TEXT NOT NULL DEFAULT '[]',
  -- 添付した資料の文字（JSON の配列。名前・文字・ページごとの行の数）
  material TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX card_chats_tenant ON card_chats (tenant_id, updated_at);
