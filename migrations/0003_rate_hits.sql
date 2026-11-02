-- 公開デモの回数の制限。IP はそのまま残さず、ハッシュにして持つ
CREATE TABLE rate_hits (
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key_hash, window_start)
);
