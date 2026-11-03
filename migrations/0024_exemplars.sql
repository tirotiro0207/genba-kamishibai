-- 手本の記録（086・087）。カードを作るときに手本として渡した、同じ会社の直し（edit）と署名済みのカード（card）。
-- 下書きの横に「前回の修正（日付・誰）を手本にしました」を出すのに使う。誰は役割と番号だけ（名前は残さない）
CREATE TABLE card_exemplars (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  card_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('edit', 'card')),
  src_card_id TEXT NOT NULL,
  by TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, card_id, kind, src_card_id, at)
);
-- カードに結び付いた Managed Agents のセッション（§5 L4）。カードが署名済みになったら消し、消した時刻を残す
CREATE TABLE card_sessions (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  card_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  error TEXT,
  PRIMARY KEY (tenant_id, session_id)
);
CREATE INDEX card_sessions_card ON card_sessions(tenant_id, card_id);
