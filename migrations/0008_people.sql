-- 利用者と役割（030b）。役割は作者・監修者（1 と 2）・教育担当・新入社員。名前は持たない（環境変数から読み、無ければ空欄）。
-- 会社のテナントは役割ごとの PIN の塩付きハッシュを持つ（PIN はスクリプトで入れる）。練習用と架空の会社は PIN 無しで役割を選べる
CREATE TABLE people (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL CHECK (role IN ('author', 'supervisor', 'trainer', 'newhire')),
  slot INTEGER NOT NULL DEFAULT 1 CHECK (slot IN (1, 2)),
  pin_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, role, slot)
);
