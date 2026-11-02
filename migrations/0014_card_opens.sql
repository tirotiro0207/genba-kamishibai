-- 署名の記録（051a）。監修者がカードのその版を最初に開いた時刻。署名までの分数（「1 枚 ○分」の元）を出すために使う
CREATE TABLE card_opens (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  card_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  actor TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, card_id, version, actor)
);
