-- Claude の API の呼び出しの記録（1 回 1 行）。中身（プロンプトと答え）は残さない
CREATE TABLE api_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  purpose TEXT NOT NULL,
  label TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  usd REAL NOT NULL,
  ms INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX api_calls_purpose_at ON api_calls (purpose, at);
