-- 抜き出しの画面（033）。入れた文と、取り出した決まり（どこから付き）を残し、人が OK した項目を追記で残す（最後を使う）
CREATE TABLE extractions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  input TEXT NOT NULL,
  rules TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX extractions_tenant ON extractions(tenant_id, created_at);

CREATE TABLE extraction_oks (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  extraction_id TEXT NOT NULL REFERENCES extractions(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  items TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER extractions_no_update BEFORE UPDATE ON extractions BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER extraction_oks_no_update BEFORE UPDATE ON extraction_oks BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER extraction_oks_no_delete BEFORE DELETE ON extraction_oks
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
