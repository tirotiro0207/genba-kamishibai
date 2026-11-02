-- ○× の組（093a）。正しいやり方の ○ のカードと、まちがったやり方の × のカードを 1 組に結ぶ。1 枚のカードは 1 つの組にだけ入る
CREATE TABLE card_pairs (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  good_card TEXT NOT NULL,
  bad_card TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, good_card),
  UNIQUE (tenant_id, bad_card),
  CHECK (good_card <> bad_card)
);
