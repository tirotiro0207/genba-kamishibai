-- データを最初の状態に戻す（030）。答えと採点の表は追記だけのまま、リセットの間（resets に開いた行がある間）だけ
-- そのテナントの行を消せるようにする。リセットは 1 つのバッチ（1 つのトランザクション）で開いて・消して・閉じる
CREATE TABLE resets (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  chain_after TEXT,
  open INTEGER NOT NULL DEFAULT 1,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER resets_no_delete BEFORE DELETE ON resets BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER resets_close_only BEFORE UPDATE ON resets WHEN NOT (OLD.open = 1 AND NEW.open = 0 AND NEW.tenant_id = OLD.tenant_id AND NEW.at = OLD.at)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

DROP TRIGGER responses_no_delete;
CREATE TRIGGER responses_no_delete BEFORE DELETE ON responses
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

DROP TRIGGER grades_no_delete;
CREATE TRIGGER grades_no_delete BEFORE DELETE ON grades
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
