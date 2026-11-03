-- 仕分けの入れ替え（061）。監修者が夜間の仕分けの「カードにする／しない」を入れ替えると、card を書き換え、
-- 最初の AI の答えを ai_card に残し、入れ替えた人（役割のしるし）・時刻・理由を足す。元に戻すと ai_card と同じになる
ALTER TABLE night_pages ADD COLUMN ai_card INTEGER;
ALTER TABLE night_pages ADD COLUMN swapped_by TEXT;
ALTER TABLE night_pages ADD COLUMN swapped_at TEXT;
ALTER TABLE night_pages ADD COLUMN swap_reason TEXT;
