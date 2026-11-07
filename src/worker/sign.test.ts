import type Anthropic from "@anthropic-ai/sdk";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonical, sha256Hex } from "../shared/audit";
import { sampleCard } from "../../tests/fixtures/card";
import { setClientFactory } from "./claude-client";
import { signRole } from "./people";
import { jstDay, SIGN_DAILY_MAX, signCard, signedToday } from "./sign";

// 署名の記録（051a）
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const base = "/api/t/practice/cards";
const reply = (obj: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 } }) as unknown as Anthropic.Message;
const MARK = { kind: "finger", png: "data:image/png;base64," + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3)) };
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));

async function as(role: "supervisor" | "author" | "trainer", slot: 1 | 2 = 1) {
  return { "content-type": "application/json", "x-role": await signRole("test-secret", "practice", { role, slot }) };
}
const post = async (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) => call(path, { method: "POST", headers, body: JSON.stringify(body) });

/** 作る → 確認に回す → 確かめる AI の証拠 → OK */
async function okCard() {
  const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
  expect((await post(`${base}/${id}/status`, { to: "pending" })).status).toBe(200);
  expect((await post(`${base}/${id}/verify`, { frames: [PNG, PNG, PNG] })).status).toBe(200);
  expect((await post(`${base}/${id}/status`, { to: "ok" })).status).toBe(200);
  return id;
}

describe("署名の記録（051a）", () => {
  beforeAll(() =>
    setClientFactory(() => ({
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) =>
          String(p.system).includes("新入社員です")
            ? reply({ frames: [], meaning: "当てる", do: "当てる", dont: null, why_guess: null, confidence: 50 })
            : reply({ points: [{ id: "s1", credit: "full", frame: 1, reason: "r" }, { id: "s2", credit: "full", frame: 2, reason: "r" }], dangerous: false, danger_reason: null, summary: "伝わる" }),
      },
    })),
  );
  afterAll(() => setClientFactory(null));

  it("版・日付・中身のハッシュと、開いてから署名までの分数が ⑤ に残り、署名済みになる", async () => {
    const id = await okCard();
    const sup = await as("supervisor", 2);
    const opened = (await (await post(`${base}/${id}/open`, {}, sup)).json()) as { version: number; opened_at: string };
    expect(opened.version).toBe(1);
    // 2 回目に開いても、最初の時刻のまま
    expect(((await (await post(`${base}/${id}/open`, {}, sup)).json()) as { opened_at: string }).opened_at).toBe(opened.opened_at);
    // 開いたのを 7 分半前にずらす
    const before = new Date(Date.now() - 7.5 * 60000).toISOString();
    await env.DB.prepare("UPDATE card_opens SET opened_at = ? WHERE card_id = ?").bind(before, id).run();

    const res = await post(`${base}/${id}/sign`, { version: 1, mark: MARK }, sup);
    expect(res.status).toBe(200);
    const s = (await res.json()) as { version: number; signed_at: string; content_sha256: string; minutes: number; opened_at: string };
    expect(s).toMatchObject({ version: 1, minutes: 8, opened_at: before });
    expect(Date.now() - Date.parse(s.signed_at)).toBeLessThan(60000);
    const row = await env.DB.prepare("SELECT body, status FROM cards WHERE id = ?").bind(id).first<{ body: string; status: string }>();
    expect(row!.status).toBe("signed");
    expect(s.content_sha256).toBe(await sha256Hex(canonical(JSON.parse(row!.body))));

    const log = (await (await call(`/api/t/practice/audit/cards/${id}`)).json()) as { entries: { kind: string; step: number; actor: string; payload: { content_sha256: string } }[] };
    const sign = log.entries.filter((e) => e.kind === "sign");
    expect(sign).toHaveLength(1);
    expect(sign[0]).toMatchObject({ step: 5, actor: "supervisor.2", payload: { content_sha256: s.content_sha256 } });
    expect(((await (await call("/api/t/practice/audit/verify")).json()) as { ok: boolean }).ok).toBe(true);

    // 署名の入力（051b）は種類と PNG のハッシュが ⑤ に残る
    expect((sign[0].payload as unknown as { mark: { kind: string; sha256: string } }).mark).toMatchObject({ kind: "finger", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    // 署名済みはもう一度は署名できない
    expect((await post(`${base}/${id}/sign`, { version: 1, mark: MARK }, sup)).status).toBe(409);

    // ホームのまとめ（一覧）に、署名した人と日時が添わる。署名していないカードは null
    const other = ((await (await post(base, { card: sampleCard() })).json()) as { id: string }).id;
    const list = (await (await call(base)).json()) as { cards: { id: string; signed: { role: string; slot: number; name: string; at: string } | null }[] };
    expect(list.cards.find((c) => c.id === id)!.signed).toMatchObject({ role: "supervisor", slot: 2, at: s.signed_at, name: expect.any(String) });
    expect(list.cards.find((c) => c.id === other)!.signed).toBeNull();
  });

  it("監修者のほかは署名できない", async () => {
    const id = await okCard();
    for (const r of ["author", "trainer"] as const) expect((await post(`${base}/${id}/sign`, { version: 1 }, await as(r))).status, r).toBe(403);
    expect((await post(`${base}/${id}/sign`, { version: 1 })).status).toBe(403);
  });

  it("OK でないカード・版の違う署名・証拠の無い版は断る", async () => {
    const sup = await as("supervisor");
    const { id } = (await (await post(base, { card: sampleCard() })).json()) as { id: string };
    expect((await post(`${base}/${id}/sign`, { version: 1 }, sup)).status).toBe(409);
    const ok = await okCard();
    expect((await post(`${base}/${ok}/sign`, { version: 2 }, sup)).status).toBe(409);
    expect((await post(`${base}/${ok}/sign`, {}, sup)).status).toBe(409);
    expect((await post(`${base}/missing/sign`, { version: 1 }, sup)).status).toBe(404);
  });

  it("署名の入力（指か電子印鑑の PNG）が無い・PNG でない署名は断り、署名済みにしない（051b）", async () => {
    const sup = await as("supervisor");
    const id = await okCard();
    for (const mark of [undefined, { kind: "pen", png: MARK.png }, { kind: "stamp", png: "data:image/png;base64," + btoa("GIF89a....") }, { kind: "stamp", png: "data:image/png;base64,%%%" }])
      expect((await post(`${base}/${id}/sign`, { version: 1, mark }, sup)).status, JSON.stringify(mark)).toBe(400);
    expect((await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(id).first<{ status: string }>())!.status).toBe("ok");
    expect((await post(`${base}/${id}/sign`, { version: 1, mark: { ...MARK, kind: "stamp" } }, sup)).status).toBe(200);
  });

  it("開いた記録が無ければ分数は空。署名のあとに中身を書き換えると、ハッシュが合わないと分かる", async () => {
    const id = await okCard();
    const s = (await (await post(`${base}/${id}/sign`, { version: 1, mark: MARK }, await as("supervisor"))).json()) as { minutes: number | null };
    expect(s.minutes).toBeNull();
    const sig = async () => (await (await call(`${base}/${id}/signature`)).json()) as { signed: boolean; matches: boolean };
    expect(await sig()).toMatchObject({ signed: true, matches: true });
    // 裏で中身を書き換える
    await env.DB.prepare("UPDATE cards SET body = json_set(body, '$.why', '書き換えた') WHERE id = ?").bind(id).run();
    expect(await sig()).toMatchObject({ signed: true, matches: false });
  });

  it("日本時間の 1 日の区切りは、前の日の 15:00（UTC）から", () => {
    expect(jstDay(new Date("2031-03-10T14:59:59Z"))).toEqual({ from: "2031-03-09T15:00:00.000Z", to: "2031-03-10T15:00:00.000Z" });
    expect(jstDay(new Date("2031-03-10T15:00:00Z"))).toEqual({ from: "2031-03-10T15:00:00.000Z", to: "2031-03-11T15:00:00.000Z" });
    expect(jstDay(new Date("2031-03-10T00:00:00Z")).from).toBe("2031-03-09T15:00:00.000Z");
  });

  it("同じ監修者が 1 日（日本時間）に署名できるのは 20 枚まで。21 枚目は断り、翌日（日本時間）と別の監修者は署名できる（052）", async () => {
    expect(SIGN_DAILY_MAX).toBe(20);
    const me = { role: "supervisor", slot: 1 } as const;
    // 他のテストの署名と日が重ならないよう、先の日付で数える。日本時間 2031-03-10 の 23:59 まで
    const day = new Date("2031-03-10T14:59:00Z");
    for (let i = 0; i < SIGN_DAILY_MAX; i++) {
      const res = await signCard(env.DB, "practice", await okCard(), me, 1, MARK, day);
      expect(res.ok, `${i + 1} 枚目`).toBe(true);
    }
    expect(await signedToday(env.DB, "practice", "supervisor.1", day)).toBe(SIGN_DAILY_MAX);
    const over = await okCard();
    const no = await signCard(env.DB, "practice", over, me, 1, MARK, day);
    expect(no).toMatchObject({ ok: false, status: 429 });
    expect(no.ok ? "" : no.error).toContain("20 枚");
    // 断った枚は署名済みにならず、署名の行も増えない
    expect((await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(over).first<{ status: string }>())!.status).toBe("ok");
    expect(await signedToday(env.DB, "practice", "supervisor.1", day)).toBe(SIGN_DAILY_MAX);
    // もう 1 人の監修者は数えない
    expect((await signCard(env.DB, "practice", over, { role: "supervisor", slot: 2 }, 1, MARK, new Date("2031-03-10T14:59:30Z"))).ok).toBe(true);
    // 日本時間で翌日になれば、また署名できる
    expect((await signCard(env.DB, "practice", await okCard(), me, 1, MARK, new Date("2031-03-10T15:00:00Z"))).ok).toBe(true);
    // 翌日の署名は前の日の数に入らない
    expect(await signedToday(env.DB, "practice", "supervisor.1", day)).toBe(SIGN_DAILY_MAX);
  }, 60_000);

  it("画面の署名の口でも、上限を超えた署名は 429 になる（052）", async () => {
    // 今日の分を上限まで埋めた別の監修者の役を作れないので、署名の行を直接足して今日の数を上限にする
    const { appendAudit } = await import("./audit");
    for (let i = 0; i < SIGN_DAILY_MAX; i++) await appendAudit(env.DB, "practice", { card_id: null, kind: "sign", actor: "supervisor.1", payload: { version: 1, signed_at: new Date().toISOString() } });
    const id = await okCard();
    const res = await post(`${base}/${id}/sign`, { version: 1, mark: MARK }, await as("supervisor", 1));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toContain("1 日に署名できるのは 20 枚まで");
    expect((await env.DB.prepare("SELECT status FROM cards WHERE id = ?").bind(id).first<{ status: string }>())!.status).toBe("ok");
    // 監修者 2 は今日もまだ署名できる
    expect((await post(`${base}/${id}/sign`, { version: 1, mark: MARK }, await as("supervisor", 2))).status).toBe(200);
  });
});
