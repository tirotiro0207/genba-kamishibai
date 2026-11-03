import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sampleCard } from "../../tests/fixtures/card";
import { wordsFromChange, wordsFromEdit } from "../shared/company-words";
import { addTerms } from "./cards";
import { listCompanyWords } from "./company-words";

// 会社の言葉の保存（085）: 呼び方・言い換え・使わない言い方をテナント別に保存し、用語表と修正の差分から積む。API は使わない
const call = (path: string, init?: RequestInit) => exports.default.fetch(`http://local${path}`, init);
const send = (method: string, path: string, body: unknown) => call(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const newCard = async (tenant: string) => ((await (await send("POST", `/api/t/${tenant}/cards`, { card: sampleCard() })).json()) as { id: string }).id;

describe("直しの差分から言葉を取り出す（085）", () => {
  it("言葉の切れ目に揃えて、言い換えを取る", () => {
    expect(wordsFromEdit("ブレーカーを切ってから作業する", "主幹を切ってから作業する")).toEqual([{ kind: "rephrase", phrase: "ブレーカー", prefer: "主幹" }]);
    // 「器」だけでなく、続く漢字まで広げる
    expect(wordsFromEdit("検電器で確かめる", "検電ドライバーで確かめる")).toEqual([{ kind: "rephrase", phrase: "検電器", prefer: "検電ドライバー" }]);
  });

  it("消された言い方は使わない言い方、1 字の助詞の入れ替えと長い書き直しは取らない", () => {
    expect(wordsFromEdit("必ず絶対に手袋をはめる", "必ず手袋をはめる")).toEqual([{ kind: "avoid", phrase: "絶対に", prefer: "" }]);
    expect(wordsFromEdit("盤で確かめる", "盤を確かめる")).toEqual([]);
    expect(wordsFromEdit("手袋をはめる", "作業の前に、絶縁の手袋と保護めがねを身につけて、上司に声をかけてから始める")).toEqual([]);
  });

  it("1 つの欄に 2 か所の直しがあれば 2 つ取り、言葉の欄はやさしい日本語だけを比べる（ベトナム語は比べない）", () => {
    const got = wordsFromChange(
      { rule: "ブレーカーを切り、脚立を立てる", words: { ja: "盤を あける", vi: "mở tủ" } },
      { rule: "主幹を切り、可搬式作業台を立てる", words: { ja: "分電盤を あける", vi: "mở tủ điện" } },
    );
    expect(got).toEqual([
      { kind: "rephrase", phrase: "ブレーカー", prefer: "主幹" },
      { kind: "rephrase", phrase: "脚立", prefer: "可搬式作業台" },
      // 「盤」→「分電盤」は前が 1 字なので取らない
    ]);
  });
});

describe("会社の言葉の保存（085）", () => {
  it("人が直すたびに、言い換えがテナントに積まれ、2 回で使わない言い方にも出る", async () => {
    const id = await newCard("practice");
    const c1 = { ...sampleCard(), rule: sampleCard().rule.replace("検電器", "検電ドライバー") };
    expect((await send("PUT", `/api/t/practice/cards/${id}`, { card: c1, reason: "会社の呼び方" })).status).toBe(200);
    let w = await listCompanyWords(env.DB, "practice");
    expect(w.rephrase).toContainEqual(expect.objectContaining({ phrase: "検電器", prefer: "検電ドライバー", hits: 1 }));
    expect(w.avoid.map((r) => r.phrase)).not.toContain("検電器");

    // 別のカードで同じ直し → 回数が 2 になり、使わない言い方に出る
    const id2 = await newCard("practice");
    expect((await send("PUT", `/api/t/practice/cards/${id2}`, { card: c1, reason: "会社の呼び方" })).status).toBe(200);
    w = await listCompanyWords(env.DB, "practice");
    expect(w.rephrase).toContainEqual(expect.objectContaining({ phrase: "検電器", prefer: "検電ドライバー", hits: 2 }));
    expect(w.avoid.map((r) => r.phrase)).toContain("検電器");
  });

  it("用語表に積んだ言葉は、会社の呼び方になる", async () => {
    const id = await newCard("practice");
    await addTerms(env.DB, "practice", id, [{ ja: "主幹", vi: "aptomat tổng" }]);
    const w = await listCompanyWords(env.DB, "practice");
    expect(w.call).toContainEqual(expect.objectContaining({ phrase: "主幹", prefer: "aptomat tổng" }));
  });

  it("ほかのテナントの言葉とは混ざらない", async () => {
    const id = await newCard("demo");
    const c1 = { ...sampleCard(), why: sampleCard().why.replace("電気", "電流") };
    expect((await send("PUT", `/api/t/demo/cards/${id}`, { card: c1, reason: "言い方" })).status).toBe(200);
    const demo = await listCompanyWords(env.DB, "demo");
    expect(demo.rephrase.map((r) => r.prefer)).toContain("電流");
    const practice = await listCompanyWords(env.DB, "practice");
    expect(practice.rephrase.map((r) => r.prefer)).not.toContain("電流");
  });
});
