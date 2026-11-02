-- 回答の採点（025）。採点 2 人が別々に付け、記録は追記だけ。付け直しは新しい行を足し、最後の行を使う
CREATE TABLE grades (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  response_seq INTEGER NOT NULL REFERENCES responses(seq),
  grader TEXT NOT NULL CHECK (grader IN ('g1', 'g2')),
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'wrong', 'danger')),
  answer_ja TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX grades_trial ON grades(trial_id, response_seq, grader, seq);

CREATE TRIGGER grades_no_update BEFORE UPDATE ON grades BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER grades_no_delete BEFORE DELETE ON grades BEGIN SELECT RAISE(ABORT, 'append only'); END;
