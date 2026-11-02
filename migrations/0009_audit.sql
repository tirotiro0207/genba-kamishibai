-- 監査の記録（020）。テナントごとの連鎖に、1 行ずつ前の行のハッシュを含めて追記する。書き換えと消すことは DB が断る。
-- 連鎖はテナントごとに始め直せる（025b のリセット）。古い連鎖は消さずにとっておく
CREATE TABLE audit_chains (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  chain TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, chain)
);

CREATE TABLE audit_log (
  tenant_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  n INTEGER NOT NULL,
  card_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('source', 'make', 'verify', 'edit', 'sign', 'status', 'ai_draft', 'erase')),
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, chain, n),
  FOREIGN KEY (tenant_id, chain) REFERENCES audit_chains(tenant_id, chain)
);
CREATE INDEX audit_card ON audit_log(tenant_id, card_id, chain, n);

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER audit_chains_no_update BEFORE UPDATE ON audit_chains BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER audit_chains_no_delete BEFORE DELETE ON audit_chains BEGIN SELECT RAISE(ABORT, 'append only'); END;
