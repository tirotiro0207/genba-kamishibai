-- 「監修者に確認」の印（039）。作る人が、言い換えた・元の文に対応が無いなど、監修者に確かめてほしい理由を書く。無ければ NULL
ALTER TABLE cards ADD COLUMN ask TEXT;
