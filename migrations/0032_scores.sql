-- 試しの答えの 10 段階の採点とコメント（11/7 作者）。採点するのは作者と監修者の 2 人で、それぞれ自分の分だけを見る。
-- 1 つの答え（① の答え r:<responses.seq>・② の絵の答え p:<picture_answers.seq>）と、② のカードそのもの（c:<カードの ID>）に付ける。
-- 記録は追記だけ。付け直しは新しい行を足し、採点者・対象ごとに最後の行を使う
CREATE TABLE scores (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  target TEXT NOT NULL,
  grader TEXT NOT NULL CHECK (grader IN ('author', 'supervisor')),
  score INTEGER CHECK (score IS NULL OR score BETWEEN 1 AND 10),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX scores_trial ON scores(trial_id, grader, target, seq);
CREATE TRIGGER scores_no_update BEFORE UPDATE ON scores BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER scores_no_delete BEFORE DELETE ON scores
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

-- 母語の欄の答えの日本語の訳（Claude の参考の訳）。採点する人が読めるように、1 つの答えに 1 つだけ置く。
-- やめた人の答えを消すときは、訳も消す
CREATE TABLE score_ja (
  trial_id TEXT NOT NULL REFERENCES trials(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  target TEXT NOT NULL,
  ja TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (trial_id, target)
);
