-- 回答の記録（011）。回ごとに種を残し、答えは追記だけ。書き換えと消すことは DB が断る（消す決まりは 025b）
CREATE TABLE trials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  seed TEXT NOT NULL,
  participants TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE responses (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  participant TEXT NOT NULL,
  item TEXT NOT NULL CHECK (item IN ('A', 'B')),
  shown TEXT NOT NULL CHECK (shown IN ('card', 'text')),
  ms INTEGER,
  answer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX responses_trial ON responses(trial_id, seq);

CREATE TRIGGER responses_no_update BEFORE UPDATE ON responses BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER responses_no_delete BEFORE DELETE ON responses BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER trials_no_update BEFORE UPDATE ON trials BEGIN SELECT RAISE(ABORT, 'append only'); END;
