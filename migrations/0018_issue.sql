-- 発行の管理（088）。署名済みのカードを配ったあとの 3 つの記録。
-- card_views: 新入社員の側でカードを見た記録。版・役割のしるしごとに最初と最後に見た時刻と回数（誰がいつ見たか）
CREATE TABLE card_views (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  card_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  actor TEXT NOT NULL,
  first_viewed_at TEXT NOT NULL,
  last_viewed_at TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, card_id, version, actor)
);

-- recall_notices: 署名済みのカードを止めたときの回収の知らせ。印刷したカードを回収できるよう、止めた版と署名の日付を持つ。
-- 教育担当が読んだら read_at / read_by が入る
CREATE TABLE recall_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  card_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  signed_at TEXT,
  rule TEXT NOT NULL,
  reason TEXT NOT NULL,
  stopped_by TEXT NOT NULL,
  stopped_at TEXT NOT NULL,
  read_at TEXT,
  read_by TEXT
);
CREATE INDEX recall_notices_tenant ON recall_notices(tenant_id, id);

-- weekly_samples: 週ごとの抜き取り。署名済みから乱数で選んだカードと、選ぶのに使った種。テナントと週で 1 行（作り直さない）
CREATE TABLE weekly_samples (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  week TEXT NOT NULL,
  seed TEXT NOT NULL,
  picked TEXT NOT NULL,
  pool INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, week)
);
