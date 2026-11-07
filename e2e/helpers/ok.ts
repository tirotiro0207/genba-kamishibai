import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type APIRequestContext, expect } from "@playwright/test";
import { canonical, entryHash, GENESIS } from "../../src/shared/audit";
import { AGENT } from "../../src/shared/verify/formal";

// 録画のテストで、カードを本物の AI を呼ばずに OK まで進める（052 の gate.spec.ts から切り出した）。
// 確認待ちにしてから、テスト用の確かめる AI の証拠を、テナントの監査の連鎖に正しいハッシュで足し、OK にする
export const sqlFile = (text: string) => {
  const f = join(mkdtempSync(join(tmpdir(), "e2e-sql-")), "q.sql");
  writeFileSync(f, text);
  execSync(`npx wrangler d1 execute DB --local --file "${f}"`, { stdio: "pipe" });
};
// SQL をシェルの引用符に埋めると " を含む文で壊れるので、いつもファイルで渡す
export const sql = (q: string) => sqlFile(q);
export const MARK = { kind: "stamp", png: "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64") };

/** 使い捨てのテナントを作る（署名の数は監修者ごと・日ごとなので、前の回の署名が数に入らないように） */
export function freshTenant(prefix: string, name: string) {
  const id = `${prefix}-${Date.now()}`;
  sql(`INSERT INTO tenants (id, kind, name) VALUES ('${id}', 'demo', '${name}')`);
  return id;
}

/** ids を（版 1 の）OK まで進める。最後のカードの最後の行がテナントの連鎖の先頭である前提（ほかの操作を挟まない） */
export async function toOk(request: APIRequestContext, tenant: string, ids: string[]) {
  const api = `/api/t/${tenant}`;
  for (const id of ids) expect((await request.post(`${api}/cards/${id}/status`, { data: { to: "pending" } })).status()).toBe(200);
  const last = (await (await request.get(`${api}/audit/cards/${ids[ids.length - 1]}`)).json()) as { entries: { chain: string; n: number; hash: string }[] };
  const tip = last.entries[last.entries.length - 1];
  let prev = tip.hash;
  let n = tip.n;
  const lines: string[] = [];
  for (const id of ids) {
    const evidence = {
      agent: AGENT,
      model: "e2e",
      frames: 3,
      cited: [1, 2, 3],
      rate: 100,
      band: "green",
      dangerous: false,
      reason: "テスト用の証拠（本物の AI は呼んでいない）",
      points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }],
      reading: { frames: [], meaning: "", do: "", dont: null, why_guess: null, confidence: 50 },
    };
    const payload = { version: 1, evidence, png_sha256: [] as string[] };
    const row = { tenant_id: tenant, chain: tip.chain, n: ++n, card_id: id, kind: "verify" as const, actor: AGENT, payload, created_at: new Date().toISOString(), prev_hash: prev };
    const hash = await entryHash(row);
    lines.push(
      `INSERT INTO audit_log (tenant_id, chain, n, card_id, kind, actor, payload, created_at, prev_hash, hash) VALUES ('${tenant}', '${tip.chain}', ${row.n}, '${id}', 'verify', '${AGENT}', '${canonical(payload).replaceAll("'", "''")}', '${row.created_at}', '${prev}', '${hash}');`,
    );
    prev = hash;
  }
  expect(prev).not.toBe(GENESIS);
  sqlFile(lines.join("\n"));
  for (const id of ids) expect((await request.post(`${api}/cards/${id}/status`, { data: { to: "ok" } })).status()).toBe(200);
}

/** 役割で入ったしるし（x-role の中身） */
export async function login(request: APIRequestContext, tenant: string, role: string, slot = 1) {
  return ((await (await request.post(`/api/t/${tenant}/login`, { data: { role, slot } })).json()) as { token: string }).token;
}
