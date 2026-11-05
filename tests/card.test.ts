import { describe, expect, it } from "vitest";
import { canMove, routeOf, STATUSES, TRANSITIONS, validateCard } from "../src/shared/card";
import { sampleCard } from "./fixtures/card";

const errs = (f: (c: ReturnType<typeof sampleCard>) => void) => {
  const c = sampleCard();
  f(c);
  return validateCard(c).join(" / ");
};

describe("経路とカードのデータの形（019）", () => {
  it("3〜4 コマの動きと、部品ごとの経路を持つカードは通る", () => {
    expect(validateCard(sampleCard())).toEqual([]);
  });

  it("経路の無い部品は保存できない", () => {
    expect(errs((c) => c.parts.pop())).toMatch(/props\[1\] に経路が無い/);
    expect(errs((c) => (c.parts = c.parts.filter((p) => p.target.type !== "figure")))).toMatch(/figures\[0\] に経路が無い/);
    expect(errs((c) => (c.parts[0].statement = "s9"))).toMatch(/カードの文を指していない/);
    expect(errs((c) => (c.statements[0].sources = []))).toMatch(/元の文の位置が無い/);
    expect(errs((c) => (c.parts[1].target = { type: "prop", index: 5 }))).toMatch(/絵の部品を指していない/);
    expect(errs((c) => (c.parts[2].reason = ""))).toMatch(/なぜそう描いたか/);
  });

  it("元の位置は資料のページと行か、話した言葉の範囲", () => {
    expect(errs((c) => (c.statements[0].sources[0] = { kind: "doc", doc: "sample", page: 0, line: 1 }))).toMatch(/page/);
    expect(errs((c) => (c.statements[1].sources[0] = { kind: "speech", input: "in-1", start: 5, end: 5 }))).toMatch(/start < end/);
  });

  it("コマは 3〜4 で、動きの検査も通す", () => {
    expect(errs((c) => ((c.motion as { json: { keyframes: { mark: boolean }[] } }).json.keyframes[3].mark = false))).toMatch(/motion: 印は 3〜4/);
    expect(errs((c) => (c.rule = ""))).toMatch(/rule/);
    expect(errs((c) => (c.statements = c.statements.filter((s) => s.field === "rule")))).toMatch(/why の文/);
  });

  it("コマは時刻の順に 3〜4 で、キーフレームなら印の時刻と同じ", () => {
    expect(errs((c) => c.frames.pop())).toMatch(/コマは 3〜4/);
    expect(errs((c) => (c.frames[1].t = 1))).toMatch(/印と合わない/);
    expect(errs((c) => (c.frames[2].png = "practice/cards/x/3.png"))).toBe("");
  });

  it("動きは HTML でも持て、data-part の部品ごとに経路が要る", () => {
    const html = '<svg><g data-part="worker"></g><g data-part="tester"></g></svg>';
    const toHtml = (c: ReturnType<typeof sampleCard>) => {
      c.motion = { kind: "html", html, duration: 6 };
      c.frames = [{ t: 1, png: "a.png" }, { t: 3, png: "b.png" }, { t: 5, png: "c.png" }];
      c.parts = [
        { id: "p1", target: { type: "element", name: "worker" }, statement: "s1", reason: "確かめる人" },
        { id: "p2", target: { type: "element", name: "tester" }, statement: "s1", reason: "検電器" },
      ];
    };
    expect(errs(toHtml)).toBe("");
    expect(errs((c) => { toHtml(c); c.parts.pop(); })).toMatch(/部品 tester に経路が無い/);
    expect(errs((c) => { toHtml(c); c.parts[0].target = { type: "element", name: "nope" }; })).toMatch(/絵の部品を指していない/);
    expect(errs((c) => { toHtml(c); (c.motion as { html: string }).html = "<svg></svg>"; })).toMatch(/data-part の部品が無い/);
  });

  it("部品から文と元の位置を辿れる", () => {
    const r = routeOf(sampleCard(), "p2");
    expect(r?.statement.id).toBe("s1");
    expect(r?.sources[0]).toMatchObject({ kind: "doc", page: 3, line: 12 });
    expect(routeOf(sampleCard(), "nope")).toBeNull();
  });

  it("状態の移り方: 署名は OK からだけ、署名済みからは停止だけ", () => {
    expect(canMove("ok", "signed")).toBe(true);
    for (const s of STATUSES) if (s !== "ok") expect(canMove(s, "signed")).toBe(false);
    expect(TRANSITIONS.signed).toEqual(["stopped"]);
    expect(canMove("draft", "ok")).toBe(false);
    expect(canMove("stopped", "signed")).toBe(false);
    expect(canMove("stopped", "draft")).toBe(true);
    // 署名の前のカードもホームから止められる（11/5）
    for (const s of ["draft", "ai_draft", "pending", "ok"] as const) expect(canMove(s, "stopped")).toBe(true);
  });
});
