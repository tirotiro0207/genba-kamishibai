-- テナントの土台（009）。会社のテナントは PIN の塩付きハッシュを持つ。PIN そのものは置かない
ALTER TABLE tenants ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN pin_hash TEXT;

-- カード。どの読み書きも tenant_id で絞る
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX cards_tenant ON cards(tenant_id, created_at);

-- 練習用と架空の会社は最初からある。会社のテナントは PIN と一緒にスクリプトで作る
INSERT INTO tenants (id, kind, name) VALUES ('practice', 'practice', '練習用'), ('demo', 'demo', '架空の会社');
