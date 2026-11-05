import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { DEFAULT_FACE, FACE_OPTIONS, type FaceParts, faceHalfWidth, faceOutline, faceSvg, glassesSvg, hairScale } from "../src/shared/picto/avatar";
import { characterSvg, type Hair, HEADWEAR, type HeadwearKind, hairSvg, headwearSvg, type View } from "../src/shared/picto/character";
import { TRACED_HAIRS } from "../src/shared/picto/hair-traced";
import { A_POSE } from "../src/shared/picto/poses";

// キャラクターを作る画面の顔と髪（製品仕様 §14）。どの組み合わせでも、正面・斜め・真横で崩れないことを画素で確かめる
const VIEWS: View[] = ["front", "quarter", "side"];
const HAIRS: Hair[] = ["bob", ...TRACED_HAIRS];
// 作者が手で塗り直した髪（TRACED_HAIRS）は作者の絵が正しい（前髪が眉に掛かる・真横で前へ出る・向きでてっぺんが違う）ので、形の決まりは手で描いた形だけに当てる
const HAND_HAIRS: Hair[] = ["bob"];

/** 頭だけを 1 倍で描き、塗られた所を取り出す。原点（首の付け根）は (100, 180) */
const paint = (body: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><g transform="translate(100 180)">${body}</g></svg>`;
  const px = new Resvg(svg).render().pixels;
  return (x: number, y: number) => px[((y + 180) * 200 + (x + 100)) * 4 + 3] > 0;
};
const points = (at: (x: number, y: number) => boolean) => {
  const out: [number, number][] = [];
  for (let y = -180; y < 20; y++) for (let x = -100; x < 100; x++) if (at(x, y)) out.push([x, y]);
  return out;
};

/** 種を決めた乱数（毎回同じ組み合わせ） */
const rand = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const randomFace = (r: () => number): FaceParts => ({
  face: pick(r, FACE_OPTIONS.face), eyeShape: pick(r, FACE_OPTIONS.eyeShape), eyeSize: pick(r, FACE_OPTIONS.eyeSize),
  lashes: pick(r, FACE_OPTIONS.lashes), brows: pick(r, FACE_OPTIONS.brows), mouth: pick(r, FACE_OPTIONS.mouth),
  glasses: pick(r, FACE_OPTIONS.glasses), skin: pick(r, FACE_OPTIONS.skin), beard: pick(r, FACE_OPTIONS.beard),
});
/** 部品を 1 つずつ変えた組み合わせ（ほかは初めの値）と、乱数の 40 組 */
const FACES: FaceParts[] = [
  ...(Object.keys(FACE_OPTIONS) as (keyof FaceParts)[]).flatMap((key) => FACE_OPTIONS[key].map((v) => ({ ...DEFAULT_FACE, [key]: v }))),
  ...Array.from({ length: 40 }, (_, i, r = rand(7 + i)) => randomFace(r)),
];

describe("キャラクターを作る画面の顔と髪", () => {
  it("初めの値は今までの絵と 1 文字も変わらない（3 つの向き × 3 つの髪 × かぶり物 5 つ × マスクの有無）", () => {
    const want = JSON.parse(readFileSync("tests/fixtures/picto-avatar-default.json", "utf-8")) as Record<string, string>;
    const got: Record<string, string> = {};
    for (const key of Object.keys(want)) {
      const [view, hair, headwear, mask] = key.split("/") as [View, Hair, HeadwearKind | "none", string];
      const svg = characterSvg({ angles: A_POSE[view], x: 100, groundY: 300, height: 270, facing: "right", view, role: "new", hair, headwear, outfit: mask === "mask" ? { mask: true, ears: "muffs", visor: "clear" } : undefined });
      got[key] = createHash("sha256").update(svg).digest("hex").slice(0, 16);
    }
    expect(got).toEqual(want);
  });

  it("standard の輪郭は今までの形と同じ数", () => {
    expect(faceOutline("standard")).toBe("M-18 -70H18Q44 -70 44.6 -48L45.4 -30Q45 0 12 0H-12Q-44.6 0.4 -45 -30L-44.4 -48Q-44 -70 -18 -70Z");
  });

  it("目・眉・まつげ・口・鼻・ひげは、どの向きでも顔の中に入る（はみ出す点が無い）", () => {
    const bad: string[] = [];
    for (const f of FACES)
      for (const view of VIEWS) {
        // 輪郭の線の外側の半分（線の幅 5 の半分）までは顔とみなす
        const faceAt = paint(`<path d="${faceOutline(f.face)}" fill="#fff" stroke="#000" stroke-width="5"/>`);
        const inner = faceSvg(view, f).replace(/<path d="M[^"]*Z" fill="#(fff|e6e6e6)" stroke="#000" stroke-width="5" stroke-linejoin="round"\/>/, "");
        const out = points(paint(inner)).filter(([x, y]) => !faceAt(x, y));
        if (out.length) bad.push(`${view} ${JSON.stringify(f)}: ${out.length} 点（${out[0]}）`);
      }
    expect(bad).toEqual([]);
  }, 120000);

  it("眉は前髪に隠れない（眉の 5% 以下しか髪と重ならない）", () => {
    const bad: string[] = [];
    for (const face of FACE_OPTIONS.face)
      for (const brows of ["flat", "arch", "angled"] as const)
        for (const hair of HAND_HAIRS)
          for (const view of VIEWS) {
            const f = { ...DEFAULT_FACE, face, brows };
            const browOnly = faceSvg(view, f).replace(faceSvg(view, { ...f, brows: "none" }).replace(/<circle[\s\S]*$/, ""), "");
            const brow = points(paint(browOnly.replace(/<circle[\s\S]*$/, "")));
            const hairAt = paint(hairSvg(view, hair, "none", hairScale(face)).front);
            const hit = brow.filter(([x, y]) => hairAt(x, y)).length;
            if (brow.length && hit / brow.length > 0.05) bad.push(`${view}・${hair}・${face}・${brows}: ${hit}/${brow.length}`);
          }
    expect(bad).toEqual([]);
  }, 300000);

  it("かぶり物は 8 つの髪の全部を覆う（縁より上の髪は、かぶり物の中か、その列のかぶり物の真下にだけある）", () => {
    const bad: string[] = [];
    for (const view of VIEWS)
      for (const hair of HAIRS)
        for (const kind of Object.keys(HEADWEAR) as HeadwearKind[]) {
          // 頭の上に載せるだけの小さな帽子（看護の帽子）は髪を切らない
          if (HEADWEAR[kind].hair === "hide" || HEADWEAR[kind].perch) continue;
          const h = hairSvg(view, hair, kind);
          const hatAt = paint(headwearSvg(kind, view, "new"));
          // 髪は列ごとにかぶり物のいちばん下の線まで詰めるので、その列でかぶり物より下にある髪は覆われているとみなす。
          // つばの端の外 3 画素（縁取りの線の丸み）までは、つばの端と同じ列とみなす
          const under = (x: number, y: number) => {
            for (let dx = -3; dx <= 3; dx++) for (let v = y - 1; v >= Math.max(-180, y - 120); v--) if (hatAt(x + dx, v)) return true;
            return false;
          };
          const out = points(paint(h.back + h.front)).filter(([x, y]) => y < HEADWEAR[kind].bottom - 3 && !hatAt(x, y) && !under(x, y));
          if (out.length) bad.push(`${view}・${hair}・${kind}: ${out.length} 点（${out[0]}）`);
        }
    expect(bad).toEqual([]);
  }, 600000); // かぶり物の下も元の髪を描くので、全部の組み合わせで 5 分を超える

  it("真横で髪の前の層・目・眉・口・眼鏡のレンズが顔の前の端を大きく越えない（x ≤ 半幅 + 6）", () => {
    const bad: string[] = [];
    for (const face of FACE_OPTIONS.face) {
      const lim = faceHalfWidth(face) + 6;
      for (const hair of HAND_HAIRS) {
        const xs = points(paint(hairSvg("side", hair, "none", hairScale(face)).front)).map(([x]) => x);
        if (Math.max(...xs) > lim) bad.push(`髪 ${hair}・${face}: ${Math.max(...xs)}`);
      }
      for (const f of FACES.filter((g) => g.face === face)) {
        const xs = points(paint(faceSvg("side", f) + glassesSvg("side", f))).map(([x]) => x);
        if (Math.max(...xs) > lim) bad.push(`顔 ${JSON.stringify(f)}: ${Math.max(...xs)}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120000);

  // 帯は、作者が見て直した今の 3 つ（bob・short・bun）の値（斜め 1.27〜1.35、真横 1.30〜1.43）に余りを足したもの。
  // 斜めと真横は後ろ頭の髪が見えるので、正面より多くなるのが正しい
  it("髪の量とてっぺんの高さが、向きで変わりすぎない（別の髪形に見えない）", () => {
    const bad: string[] = [];
    for (const hair of HAND_HAIRS) {
      const p = VIEWS.map((v) => points(paint(hairSvg(v, hair, "none").back + hairSvg(v, hair, "none").front)));
      const [front, quarter, side] = p.map((q) => q.length);
      const top = VIEWS.map((v) => Math.min(...points(paint(hairSvg(v, hair, "none").front)).map(([, y]) => y)));
      if (quarter / front < 0.85 || quarter / front > 1.6) bad.push(`${hair} 斜め/正面 ${(quarter / front).toFixed(2)}`);
      if (side / front < 0.8 || side / front > 1.7) bad.push(`${hair} 真横/正面 ${(side / front).toFixed(2)}`);
      if (Math.max(...top) - Math.min(...top) > 3) bad.push(`${hair} てっぺん ${top.join(",")}`);
    }
    expect(bad).toEqual([]);
  }, 60000);

  it("斜めの目の間は正面より狭い（0.70〜0.85 倍）。後ろ髪は胴より後ろに描く", () => {
    for (const face of FACE_OPTIONS.face) {
      const xs = (v: View) => [...faceSvg(v, { ...DEFAULT_FACE, face }).matchAll(/<ellipse cx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      const [a, b] = xs("front"), [c, d] = xs("quarter");
      const ratio = (d - c) / (b - a);
      expect(ratio, face).toBeGreaterThanOrEqual(0.7);
      expect(ratio, face).toBeLessThanOrEqual(0.85);
    }
    const svg = characterSvg({ angles: A_POSE.side, x: 100, groundY: 300, height: 270, facing: "right", view: "side", hair: "long" });
    const behind = hairSvg("side", "long", "none").behind;
    expect(svg.indexOf(behind.slice(0, 30))).toBeLessThan(svg.indexOf('<rect x="-30" y="-142"'));
  });

  it("どの組み合わせも全身で描け、色は灰色だけ", () => {
    for (const [i, f] of FACES.entries())
      for (const view of VIEWS) {
        const hair = HAIRS[i % HAIRS.length];
        const svg = characterSvg({ angles: A_POSE[view], x: 100, groundY: 300, height: 270, facing: i % 2 ? "left" : "right", view, hair, face: f, outfit: i % 3 ? undefined : { mask: true } });
        expect(() => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="320">${svg}</svg>`).render()).not.toThrow();
        const notGray = [...svg.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => m[1].toLowerCase())
          .filter((c) => (c.length === 3 ? !(c[0] === c[1] && c[1] === c[2]) : !(c.slice(0, 2) === c.slice(2, 4) && c.slice(2, 4) === c.slice(4))));
        expect(notGray).toEqual([]);
      }
  }, 120000);
});
