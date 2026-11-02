-- MCP の会社ごとの鍵（092）。鍵そのものは置かず、SHA-256 のハッシュだけを置く。止めた鍵は revoked_at が入る
CREATE TABLE mcp_keys (
  key_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);
