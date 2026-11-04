import { describe, expect, it } from "vitest";
import { type AuditEntry, entryHash, GENESIS, verifyChain } from "../src/shared/audit";
import { insertSql, rechain } from "../scripts/copy-cards-prod";

// 本番に写すカードの監査の行を、本番の連鎖の後ろにつなぎ直す（11/6 の現場の確認）
describe("カードを本番に写す", () => {
  const src = [
    { card_id: "c-1", kind: "source", actor: "maker", payload: '{"version":1}', created_at: "2026-11-02T07:31:27.000Z" },
    { card_id: "c-1", kind: "edit", actor: "author.1", payload: '{"reason":"そろえた"}', created_at: "2026-11-05T06:50:00.000Z" },
  ];

  it("本番の連鎖の最後の後ろにつなぐと、つないだ連鎖がそのまま確かめられる。中身と時刻は元のまま", async () => {
    const head = { tenant_id: "company", chain: "c1", n: 1, card_id: "x", kind: "make" as const, actor: "maker", payload: { a: 1 }, created_at: "2026-11-04T16:15:10.042Z", prev_hash: GENESIS };
    const first: AuditEntry = { ...head, hash: await entryHash(head) };
    const re = await rechain(src, "company", "c1", { n: 1, hash: first.hash });
    expect(re.map((r) => r.n)).toEqual([2, 3]);
    expect(re.map((r) => r.created_at)).toEqual(src.map((r) => r.created_at));
    const rows = [first, ...re.map((r) => ({ ...r, payload: JSON.parse(String(r.payload)) }) as AuditEntry)];
    expect(await verifyChain(rows)).toEqual({ ok: true, count: 3 });
  });

  it("連鎖が空なら 1 から始め、文字の ' を重ねて書く", async () => {
    const re = await rechain(src, "company", "c1", null);
    expect(re[0].n).toBe(1);
    expect(re[0].prev_hash).toBe(GENESIS);
    expect(insertSql("cards", { id: "a", body: "it's" })).toBe("INSERT OR IGNORE INTO cards (id, body) VALUES ('a', 'it''s');");
  });
});
