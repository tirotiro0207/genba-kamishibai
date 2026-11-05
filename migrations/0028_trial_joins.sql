-- その場で回に加わる新入社員（11/6 作者）。新入社員は ID（student_V_1 など）で入り、今の交差の回に加わる。
-- 回（trials）は書き換えない決まりなので、加わった人は別の表に足すだけにする（書き換え・消すはしない）。
-- 組（set_no）は加わったときに決め、あとから変えない（答えを入れ始めた人の見せるものが変わらないように）
CREATE TABLE trial_joins (
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  grp TEXT NOT NULL,
  set_no INTEGER NOT NULL CHECK (set_no IN (1, 2)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (trial_id, participant)
);
CREATE TRIGGER trial_joins_no_update BEFORE UPDATE ON trial_joins BEGIN SELECT RAISE(ABORT, 'append only'); END;
-- 消すのは、データを最初の状態に戻す間（resets に開いた行がある間）だけ
CREATE TRIGGER trial_joins_no_delete BEFORE DELETE ON trial_joins
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
