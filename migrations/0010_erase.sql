-- 「追記だけ」と「消す」の決まり（025b）。参加者がやめたら、その人の答えの中身（答え・秒・日本語の訳）だけを空にする。
-- 行そのものは残して erased の印を付ける。DB の守りは、この 1 通りの書き換え（中身を空にして印を付ける）だけを通す
ALTER TABLE responses ADD COLUMN erased INTEGER NOT NULL DEFAULT 0;
ALTER TABLE grades ADD COLUMN erased INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER responses_no_update;
CREATE TRIGGER responses_no_update BEFORE UPDATE ON responses
WHEN NOT (OLD.erased = 0 AND NEW.erased = 1 AND NEW.answer IS NULL AND NEW.ms IS NULL
  AND NEW.seq = OLD.seq AND NEW.trial_id = OLD.trial_id AND NEW.tenant_id = OLD.tenant_id AND NEW.participant = OLD.participant
  AND NEW.item = OLD.item AND NEW.shown = OLD.shown AND NEW.created_at = OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

DROP TRIGGER grades_no_update;
CREATE TRIGGER grades_no_update BEFORE UPDATE ON grades
WHEN NOT (OLD.erased = 0 AND NEW.erased = 1 AND NEW.answer_ja IS NULL
  AND NEW.seq = OLD.seq AND NEW.trial_id = OLD.trial_id AND NEW.tenant_id = OLD.tenant_id AND NEW.response_seq = OLD.response_seq
  AND NEW.grader = OLD.grader AND NEW.verdict = OLD.verdict AND NEW.created_at = OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
