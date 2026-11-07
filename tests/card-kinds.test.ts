// 新しい型（11/7 既定・作者の確認待ち）: 束・重さ・原則の 1 コマ・過去の事故の出どころ・点検表の 1 項目
import { describe, expect, it } from "vitest";
import { bundleSort, type CardBody, validateCard, validateSource, weightOf } from "../src/shared/card";
import { bundleFor, checklistErrors, makerParams, type OkRule } from "../src/shared/make/maker";
import { cutFrames, principleMotion, validateMotion } from "../src/shared/picto/motion";
import { MOTION, sampleCard } from "./fixtures/card";

const from = (line: number) => ({ quote: "q", line, line_end: line, found: true });
const item = (text: string, step: number | null, parent: string | null, checklist = true): OkRule => ({ kind: "do", text, from: from(1), reasons: [], checklist, reworded: false, step, parent });

/** 原則の 1 コマのカード: 最初のキーフレームの絵だけを 1 枚にする */
function principleCard(): CardBody {
  const c = sampleCard();
  const k = MOTION.keyframes[0];
  return { ...c, shape: "principle", motion: { kind: "keyframes", json: principleMotion({ figures: k.figures, props: k.props }) }, frames: [{ t: 0 }] };
}

describe("重さ（命に関わる / それ以外）", () => {
  it("life と normal だけを通し、無ければ normal として読む", () => {
    expect(validateCard({ ...sampleCard(), weight: "life" })).toEqual([]);
    expect(validateCard({ ...sampleCard(), weight: "normal" })).toEqual([]);
    expect(validateCard({ ...sampleCard(), weight: "heavy" as never }).join()).toMatch(/weight/);
    expect(weightOf(sampleCard())).toBe("normal");
    expect(weightOf({ weight: "life" })).toBe("life");
  });
});

describe("束（1 つの決まりを何枚かに分けた組）", () => {
  it("id・order・total・parent を確かめる", () => {
    expect(validateCard({ ...sampleCard(), bundle: { id: "b1", order: 2, total: 3, parent: "使う前の点検表" } })).toEqual([]);
    expect(validateCard({ ...sampleCard(), bundle: { id: "b1", order: 4, total: 3, parent: "x" } }).join()).toMatch(/order/);
    expect(validateCard({ ...sampleCard(), bundle: { id: "", order: 1, total: 1, parent: "" } }).join()).toMatch(/bundle\.id.*bundle\.parent|bundle\.parent/);
  });

  it("並べると、束は最初の 1 枚の場所に順番どおりにまとまり、ほかは元の順のまま", () => {
    const xs = [
      { id: "a" },
      { id: "b3", bundle: { id: "B", order: 3, total: 3, parent: "p" } },
      { id: "c" },
      { id: "b1", bundle: { id: "B", order: 1, total: 3, parent: "p" } },
      { id: "b2", bundle: { id: "B", order: 2, total: 3, parent: "p" } },
    ];
    expect(bundleSort(xs, (x) => x).map((x) => x.id)).toEqual(["a", "b1", "b2", "b3", "c"]);
  });

  it("点検表の 1 項目は、同じ見出しの項目と 1 つの束になる（順番は step の順）", () => {
    const rules = [item("検電器を確かめる", null, null, false), item("ヘルメットのひもを確かめる", 2, "使う前の点検"), item("安全帯のかぎを確かめる", 1, "使う前の点検"), item("別の表", 1, "終わりの点検")];
    expect(bundleFor(rules, 0, "ex1")).toBeNull();
    expect(bundleFor(rules, 1, "ex1")).toEqual({ id: "ex1:使う前の点検", order: 2, total: 2, parent: "使う前の点検" });
    expect(bundleFor(rules, 2, "ex1")).toMatchObject({ order: 1, total: 2 });
    expect(bundleFor(rules, 3, "ex1")).toMatchObject({ order: 1, total: 1, parent: "終わりの点検" });
  });
});

describe("点検表は 1 項目 1 枚", () => {
  // 取り出しの指示 8 の書き換え（step・parent を返させる）は、変更のたびの評価（API）が要るので、この直しには入れていない
  it("作る係には、その 1 項目を確かめて ✓ を付ける 1 枚と伝え、✓ があれば表の小物は要らない", () => {
    const r = item("安全帯のかぎを確かめる", 1, "使う前の点検");
    const sys = String(makerParams(r, [{ id: "s1", field: "rule", text: r.text, sources: [{ kind: "doc", doc: "d", page: 1, line: 1 }] }]).system);
    expect(sys).toContain("「使う前の点検」の 1 番目の 1 項目");
    expect(sys).not.toContain("1 つずつ ✓（check_mark）を付けていく");
    const withCheck = structuredClone(MOTION);
    withCheck.keyframes[3].props.push({ ...withCheck.keyframes[3].props[1], kind: "check_mark" });
    for (const k of withCheck.keyframes.slice(0, 3)) k.props.push({ ...k.props[1], kind: "check_mark", show: false });
    expect(checklistErrors(r, MOTION).join()).toMatch(/1 項目なのに ✓ の印が無い/);
    expect(checklistErrors(r, withCheck)).toEqual([]);
    // 項目に分けていない古い取り出しは、前の決まり（表と ✓ が要る）のまま
    expect(checklistErrors(item("表で確かめる", null, null), withCheck).join()).toMatch(/checklist の小物が無い/);
  });
});

describe("原則の 1 コマ", () => {
  it("shape が principle ならコマ 1 つ・印 1 つを通し、ふつうのカードは 3〜4 コマのまま", () => {
    const c = principleCard();
    expect(validateCard(c)).toEqual([]);
    expect(cutFrames(c.motion.kind === "keyframes" ? c.motion.json : null!)).toHaveLength(1);
    expect(validateCard({ ...c, shape: undefined }).join()).toMatch(/キーフレームは 2 つ以上/);
    expect(validateCard({ ...sampleCard(), shape: "principle" }).join()).toMatch(/印 1 か所|コマ 1 つ/);
    expect(validateCard({ ...sampleCard(), shape: "story" })).toEqual([]);
    expect(validateMotion(MOTION, { single: true }).join()).toMatch(/印 1 か所/);
  });

  it("作る係には 1 枚の絵の口（angles）の指示と、キーフレーム 1 つの決まりを渡す", () => {
    const r = item("いつも足元を見る", null, null, false);
    const sys = String(makerParams(r, [{ id: "s1", field: "rule", text: r.text, sources: [{ kind: "doc", doc: "d", page: 1, line: 1 }] }], undefined, undefined, undefined, undefined, undefined, { shape: "principle" }).system);
    expect(sys).toContain("1 枚の絵の数字を決めてください");
    expect(sys).toContain("キーフレームは 1 つだけ");
    const story = String(makerParams(r, [{ id: "s1", field: "rule", text: r.text, sources: [{ kind: "doc", doc: "d", page: 1, line: 1 }] }]).system);
    expect(story).not.toContain("キーフレームは 1 つだけ");
  });
});

describe("過去の事故と原因の出どころ", () => {
  it("何が・原因が要り、日付は形を確かめる。なぜの文の出どころに使える", () => {
    expect(validateSource({ kind: "accident", title: "脚立から落ちた", cause: "天板に立った", date: "2024-06" })).toEqual([]);
    expect(validateSource({ kind: "accident", title: "", cause: "" }).length).toBe(2);
    expect(validateSource({ kind: "accident", title: "x", cause: "y", date: "去年" }).join()).toMatch(/date/);
    const c = sampleCard();
    c.statements[1].sources.push({ kind: "accident", title: "盤で感電した", cause: "検電をしなかった" });
    expect(validateCard(c)).toEqual([]);
  });
});
