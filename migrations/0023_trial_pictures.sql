-- 059: 記録アプリに 8 枚（絵だけ）と 2 項目を載せ、教育担当の勘を集める。
-- 回ごとに絵だけで見せるカード、2 項目の訳（会社のテナントの中だけに置く）、教育担当の予想、絵だけの答えを持つ。全部テナントの中

-- 回で絵だけで見せるカード（最大 8 枚）。見せる順番は参加者ごとに種から乱数で決める（並びの番号は並べ替える前の番号）
CREATE TABLE trial_cards (
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  pos INTEGER NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id),
  PRIMARY KEY (trial_id, pos)
);

-- 2 項目（A・B）の元のページの訳。作者が用意し、会場で見せるだけ。リポジトリには入れない
CREATE TABLE trial_items (
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  item TEXT NOT NULL CHECK (item IN ('A', 'B')),
  ja TEXT,
  vi TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (trial_id, item)
);

-- 教育担当の勘: カードごとの正答率の予想（0〜100）。追記だけで、カードごとに最後の行を使う。絵だけの答えが 1 件でも入ったら受け付けない
CREATE TABLE forecasts (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  card_id TEXT NOT NULL REFERENCES cards(id),
  rate INTEGER NOT NULL CHECK (rate BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TRIGGER forecasts_no_update BEFORE UPDATE ON forecasts BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER forecasts_no_delete BEFORE DELETE ON forecasts
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

-- 絵だけの答え。参加者ごとに乱数の順番のとおりに 1 枚ずつ。消すとき（025b）は答えを空にして印を付ける
CREATE TABLE picture_answers (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  participant TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id),
  answer TEXT,
  erased INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (trial_id, participant, card_id)
);
CREATE INDEX picture_answers_trial ON picture_answers(trial_id, seq);
-- 消す（025b）ときだけ、答えを空にして印を付ける書き換えを通す
CREATE TRIGGER picture_answers_no_update BEFORE UPDATE ON picture_answers
WHEN NOT (NEW.erased = 1 AND NEW.answer IS NULL AND NEW.seq = OLD.seq AND NEW.participant = OLD.participant AND NEW.card_id = OLD.card_id AND NEW.created_at = OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER picture_answers_no_delete BEFORE DELETE ON picture_answers
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
