import { describe, expect, it } from "vitest";
import { MemoryCallLog } from "../src/shared/claude";
import { assign, edgeErrors, makeCard, makerParams, type OkRule } from "../src/shared/make/maker";
import { boardParams, PROP_JA, scriptErrors, storyErrors, storyParams, writeScript } from "../src/shared/make/script";
import { PROP_KINDS } from "../src/shared/picto/props";
import { MOTION, SCRIPT, STORY } from "./fixtures/card";
import { fakeMaker } from "./fixtures/maker";

const from = (line: number) => ({ quote: "q", line, line_end: line, found: true });
const RULE: OkRule = { kind: "do", text: "盤に触る前に検電する", from: from(3), reasons: [{ text: "感電を防ぐ", from: from(4), stated: true }], checklist: false, reworded: false };
const locate = (f: { line: number }) => ({ kind: "doc" as const, doc: "m", page: 30, line: f.line });

describe("正式な流れの作成（034a）", () => {
  it("OK した 1 項目から、3〜4 コマで部品の全部に経路がある未承認の下書きの中身ができる。既定では脚本の段を呼ばない（11/6）", async () => {
    const client = fakeMaker();
    const log = new MemoryCallLog();
    const { card, messages } = await makeCard({ client, log }, "app", RULE, locate);
    expect(card.frames.length).toBeGreaterThanOrEqual(3);
    expect(card.frames.length).toBeLessThanOrEqual(4);
    expect(card.statements).toEqual([
      { id: "s1", field: "rule", text: "盤に触る前に検電する", sources: [{ kind: "doc", doc: "m", page: 30, line: 3 }] },
      { id: "s2", field: "why", text: "感電を防ぐ", sources: [{ kind: "doc", doc: "m", page: 30, line: 4 }] },
    ]);
    expect(card.parts).toHaveLength(3);
    // 前の作り方（脚本なし）: 絵の数字の段の 1 回だけ。脚本はカードに残らず、絵の段にも渡らない
    expect(log.records.map((r) => r.label)).toEqual(["作成（動きと経路）"]);
    expect(messages).toHaveLength(1);
    expect(client.scripts).toHaveLength(0);
    expect(card.script).toBeUndefined();
    expect(String(client.sent[0].messages[0].content)).not.toContain("脚本");
  });

  it("options の script: true で、前の日の作り方（脚本 → 絵）も呼べる", async () => {
    const client = fakeMaker();
    const log = new MemoryCallLog();
    const { card } = await makeCard({ client, log }, "app", RULE, locate, undefined, undefined, undefined, { script: true });
    // 物語 → コマ割り の 2 段。脚本はカードに残り、コマ割りが絵の数字の段にそのまま渡る
    expect(log.records.map((r) => r.label)).toEqual(["脚本（物語）", "脚本（コマ割り）", "作成（動きと経路）"]);
    expect(card.script).toEqual({ ...SCRIPT, story: STORY });
    expect(String(client.scripts[1].messages[0].content)).toContain(`場面 1: ${STORY.beats[0].what}／見る人が分かること: ${STORY.beats[0].viewer}`);
    const sent = String(client.sent[0].messages[0].content);
    expect(sent).toContain("脚本（このとおりの筋で描く");
    expect(sent).toContain(`1 コマ目（${SCRIPT.frames[0].role}）: ${SCRIPT.frames[0].who}／${SCRIPT.frames[0].action}／見る人が分かること: ${SCRIPT.frames[0].viewer}`);
    expect(sent).toContain(`なぜの見せ方: ${SCRIPT.why_shown}`);
  });

  it("物語の係はコマの数に縛らず、電気工事の現場のきっかけと時間の札を考える。コマ割りの係は描ける物と吹き出しの読まれ方で 3〜4 コマに移す", () => {
    const st = storyParams(RULE, assign(RULE, locate));
    expect(String(st.system)).toMatch(/コマの数はまだ考えません/);
    expect(String(st.system)).toMatch(/電気工事の現場でよくある[\s\S]*火花が散る/);
    expect(String(st.system)).toContain("10min");
    expect(String(st.messages[0].content)).toBe("カードの文:\n守ること: 盤に触る前に検電する\nなぜ: 感電を防ぐ");
    expect(String(storyParams({ ...RULE, kind: "dont", checklist: true }, assign(RULE, locate), "bad").messages[0].content)).toMatch(/してはいけないこと[\s\S]*× の側[\s\S]*点検表の型/);
    const bd = boardParams(RULE, assign(RULE, locate), STORY);
    const sys = String(bd.system);
    expect(sys).toContain("火花（spark）");
    expect(sys).toContain("bubble_alert");
    expect(sys).toMatch(/「？」は「分からない・どうするか聞いている」/);
    expect(sys).toMatch(/①場（いつもの作業）②きっかけ（危険の瞬間・！）③山場（決まりの動き）④結果（なぜ）/);
    expect(sys).toMatch(/きっかけと山場は必ず絵にする[\s\S]*3 コマにするなら場を省く/);
    expect(String(st.system)).toMatch(/先に着地点を決める/);
    expect(String(bd.messages[0].content)).toMatch(/新人が最後に分かること: /);
    expect(String(bd.messages[0].content)).toContain("物語:\n新人が最後に分かること:");
  });

  it("物語とコマ割りは形が合わなければ 1 回だけ書き直させ、2 回とも足りなければ止める", async () => {
    expect(scriptErrors(SCRIPT)).toEqual([]);
    expect(scriptErrors({ ...SCRIPT, frames: SCRIPT.frames.slice(0, 2) })).toEqual(["コマ（frames）は 3〜4"]);
    expect(storyErrors(STORY)).toEqual([]);
    expect(storyErrors({ ...STORY, takeaway: " " })).toEqual(["着地点（takeaway・peak_picture・result_picture）が空"]);
    expect(storyErrors({ ...STORY, beats: [...STORY.beats, ...STORY.beats, ...STORY.beats] })).toContain("場面（beats）は 3〜6");
    const noPeak = { ...SCRIPT, frames: SCRIPT.frames.map((f) => ({ ...f, role: f.role === "山場" ? "結果" : f.role })) };
    expect(scriptErrors(noPeak)).toContain("「山場」のコマが無い");
    const swapped = { ...SCRIPT, frames: [...SCRIPT.frames].reverse() };
    expect(scriptErrors(swapped)).toContain("コマの役の順は 場 → きっかけ → 山場 → 結果");
    expect(storyErrors({ ...STORY, time: "7min" })).toEqual(["時間の札（time）は 1min・5min・10min・30min・1h のどれか: 7min"]);
    const bad = { ...SCRIPT, frames: [] };
    let boards = 0;
    const answer = (x: unknown) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(x) }], usage: { input_tokens: 1, output_tokens: 1 } });
    const client = { messages: { create: async (p: { system: string }) => answer(p.system.includes("物語の段") ? STORY : ++boards === 1 ? bad : SCRIPT) } };
    const { script, messages } = await writeScript({ client: client as never, log: new MemoryCallLog() }, "app", RULE, assign(RULE, locate));
    expect(messages).toHaveLength(3);
    expect(script.frames).toHaveLength(3);
    const never = { messages: { create: async (p: { system: string }) => answer(p.system.includes("物語の段") ? STORY : bad) } };
    await expect(writeScript({ client: never as never, log: new MemoryCallLog() }, "app", RULE, assign(RULE, locate))).rejects.toThrow(/脚本（コマ割り）が 2 回とも/);
  });

  it("小物の日本語の名前は、全部の小物にある", () => {
    for (const k of PROP_KINDS) expect(PROP_JA[k]).toBeTruthy();
  });

  it("絵は直接描かせない（数字の JSON だけを求める）。点検表の型は手元の✓で描かせる", () => {
    const p = makerParams(RULE, assign(RULE, locate));
    const fmt = (p as unknown as { output_config: { format: { type: string; schema: { required: string[] } } } }).output_config.format;
    expect(fmt.type).toBe("json_schema");
    expect(fmt.schema.required).toEqual(["motion", "parts", "why"]);
    expect(String(p.system)).not.toMatch(/チェックリスト（checklist）に 1 つずつ/);
    expect(String(makerParams({ ...RULE, checklist: true }, assign(RULE, locate)).system)).toMatch(/チェックリスト（checklist）に 1 つずつ/);
  });

  it("経路の無い部品があれば 1 回だけ書き直させる", async () => {
    const client = fakeMaker({ dropPart: true });
    const { card, messages } = await makeCard({ client, log: new MemoryCallLog() }, "app", RULE, locate);
    // 既定（脚本なし）は絵の数字 2 回だけ
    expect(messages).toHaveLength(2);
    expect(client.scripts).toHaveLength(0);
    expect(String(client.sent[1].messages[0].content)).toMatch(/経路が無い/);
    expect(card.parts).toHaveLength(3);
    // 脚本ありなら、脚本 2 回（物語・コマ割り）+ 絵の数字 2 回。脚本は書き直しでは呼び直さない
    const withScript = fakeMaker({ dropPart: true });
    const again = await makeCard({ client: withScript, log: new MemoryCallLog() }, "app", RULE, locate, undefined, undefined, undefined, { script: true });
    expect(again.messages).toHaveLength(4);
    expect(withScript.scripts).toHaveLength(2);
  });

  it("元の文に理由が無いとき、AI が書いた理由は ai の文になる。元の文の理由は ai ではない", async () => {
    const noWhy = { ...RULE, reasons: [] };
    const { card } = await makeCard({ client: fakeMaker({ why: "電気が来ていると感電する" }), log: new MemoryCallLog() }, "app", noWhy, locate);
    expect(card.statements[1]).toMatchObject({ field: "why", text: "電気が来ていると感電する", ai: true });
    expect(card.why).toBe("電気が来ていると感電する");
    const inferred = { ...RULE, reasons: [{ text: "下の人に当たる", from: from(3), stated: false }] };
    expect(assign(inferred, locate)[1].ai).toBe(true);
  });

  it("枠の端で半分切れる人を断る。全部入っているか、全部外に出ていればよい（11/5）", () => {
    expect(edgeErrors(MOTION)).toEqual([]);
    const at = (x: number) => ({ keyframes: MOTION.keyframes.map((k) => ({ ...k, figures: k.figures.map((f) => ({ ...f, x })) })) });
    expect(edgeErrors(at(0.97))).toHaveLength(3);
    expect(edgeErrors(at(0.97))[0]).toMatch(/^1 コマ目の figures\[0\]（new）が枠の端で切れている/);
    expect(edgeErrors(at(1.5))).toEqual([]);
  });

  it("コマ割りの係は、小物を見た目どおりにだけ使い、電気を止めるのは分電盤に手を伸ばす姿で見せる（11/5）", () => {
    const sys = String(boardParams(RULE, assign(RULE, locate), STORY).system);
    expect(sys).toMatch(/箱（box）を「元の電源」[\s\S]*使い方はしない/);
    expect(sys).toMatch(/電気を止める・切るは、人が分電盤（panel）の前まで行き/);
    expect(sys).toMatch(/知らせる人は知らせる相手のほうを向いて立ち/);
  });
});
