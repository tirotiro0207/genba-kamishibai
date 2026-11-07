-- テナントごとの小物の差し替え（11/7 作者「アセットをプロンプトと画像で直す」）。
-- asset_versions: 「直す」で Claude が作った絵の版。追記だけで、古い版を消さない（作者の決まり）
-- asset_active: どの版を使うかの記録。追記だけで、小物ごとに最後の行を使う。version_seq が空なら元の絵に戻した
CREATE TABLE asset_versions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL,
  svg TEXT NOT NULL,
  prompt TEXT NOT NULL,
  -- 添付した画像の置き場（R2 の鍵）。無ければ空
  image_key TEXT,
  -- 直す前の版（元の絵から直したなら空）
  from_seq INTEGER,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX asset_versions_kind ON asset_versions(tenant_id, kind, seq);
CREATE TRIGGER asset_versions_no_update BEFORE UPDATE ON asset_versions BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER asset_versions_no_delete BEFORE DELETE ON asset_versions
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

CREATE TABLE asset_active (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL,
  version_seq INTEGER REFERENCES asset_versions(seq),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX asset_active_kind ON asset_active(tenant_id, kind, seq);
CREATE TRIGGER asset_active_no_update BEFORE UPDATE ON asset_active BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER asset_active_no_delete BEFORE DELETE ON asset_active
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
