import { describe, expect, it } from "vitest";
import { type AuditEntry, canonical, entryHash, GENESIS, verifyChain } from "../src/shared/audit";

async function chain(n: number): Promise<AuditEntry[]> {
  const out: AuditEntry[] = [];
  let prev = GENESIS;
  for (let i = 1; i <= n; i++) {
    const d = { tenant_id: "t", chain: "c1", n: i, card_id: "card", kind: "edit" as const, actor: "a", payload: { i, note: "x" }, created_at: `2026-11-02T00:00:0${i}Z`, prev_hash: prev };
    const hash = await entryHash(d);
    out.push({ ...d, hash });
    prev = hash;
  }
  return out;
}

describe("監査の記録のハッシュの連鎖（020）", () => {
  it("キーの順番が違っても同じ文字列になる", () => {
    expect(canonical({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: null } })).toBe(canonical({ a: { c: null, d: [1, { e: 3, f: 2 }] }, b: 1 }));
  });

  it("そのままなら通り、途中を書き換える・消す・入れ替えると落ちる", async () => {
    const rows = await chain(5);
    expect(await verifyChain(rows)).toEqual({ ok: true, count: 5 });
    const edited = structuredClone(rows);
    (edited[2].payload as { note: string }).note = "y";
    expect(await verifyChain(edited)).toMatchObject({ ok: false, at: 3, reason: /書き換え/ });
    const dropped = rows.filter((r) => r.n !== 3);
    expect(await verifyChain(dropped)).toMatchObject({ ok: false, at: 3 });
    // 消したあとに番号を詰めても、前のハッシュと合わない
    const renumbered = dropped.map((r, i) => ({ ...r, n: i + 1 }));
    expect(await verifyChain(renumbered)).toMatchObject({ ok: false, at: 3, reason: /前の行/ });
    // ハッシュも作り直す書き換えは、次の行で落ちる
    const forged = structuredClone(rows);
    (forged[1].payload as { note: string }).note = "z";
    forged[1].hash = await entryHash(forged[1]);
    expect(await verifyChain(forged)).toMatchObject({ ok: false, at: 3, reason: /前の行/ });
  });
});
