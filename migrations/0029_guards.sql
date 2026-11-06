-- 追記だけの表の守りをそろえる（点検の直し）。
-- 1) 絵だけの答えの「消す」書き換えも、答えと採点（0010）と同じく、まだ消していない行を、回とテナントを変えずに空にするときだけ通す
DROP TRIGGER picture_answers_no_update;
CREATE TRIGGER picture_answers_no_update BEFORE UPDATE ON picture_answers
WHEN NOT (OLD.erased = 0 AND NEW.erased = 1 AND NEW.answer IS NULL
  AND NEW.seq = OLD.seq AND NEW.trial_id = OLD.trial_id AND NEW.tenant_id = OLD.tenant_id AND NEW.participant = OLD.participant
  AND NEW.card_id = OLD.card_id AND NEW.created_at = OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

-- 2) 試しの回と取り出しの記録は、データを戻す間（resets に開いた行がある間）のほかは消せない
CREATE TRIGGER trials_no_delete BEFORE DELETE ON trials
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER extractions_no_delete BEFORE DELETE ON extractions
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

-- 3) 取り出しの OK は、取り出しごとに最後の 1 行を引く（OK のたびに行が増えても全部を読まない）
CREATE INDEX extraction_oks_ext ON extraction_oks(extraction_id, seq);
