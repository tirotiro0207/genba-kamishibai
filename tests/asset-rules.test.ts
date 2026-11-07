import { Resvg } from "@resvg/resvg-js";
import { afterEach, describe, expect, it } from "vitest";
import { ASSET_LIST, assetPreviewSvg, wearBaseBodies, wearPreviewSvg, facePreviewSvg } from "../src/shared/picto/asset-catalog";
import {
  BROW_Y, DEFAULT_RIG, type ExprRig, grayColor, grayifySvg, groupOfKind, KIND_RE, MOUTH_WIDTH, normalizeRig, parseFace, parseWear, stringifyWear, TORSO_HALF, VIEWS, wearFrame, wearKind, wearSvg,
} from "../src/shared/picto/asset-rules";
import { DEFAULT_FACE, EXPRESSIONS, expressionRig, FACE_OPTIONS, faceOutline, faceSvg } from "../src/shared/picto/avatar";
import { characterSvg, type View } from "../src/shared/picto/character";
import { GARMENTS, garmentBase, outfitTorso } from "../src/shared/picto/outfit";
import { A_POSE } from "../src/shared/picto/poses";
import { cleanAssetSvg, clearPropOverrides, setPropOverrides, wearOverride } from "../src/shared/picto/prop-override";

// 差し替えの大元の決まり（asset-rules.ts / docs/assets.md）を、描く側（outfit・avatar）から確かめる
afterEach(() => clearPropOverrides());

const isGray = (c: string) => /^#([0-9a-f]{2})\1\1$/.test(c);
const grayOnly = (svg: string) => [...svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]).every((c) => c === "none" || c === "TONE" || isGray(c));

describe("kind の名前", () => {
  it("小物はそのまま、服は wear_ + snake_case、表情は face_ + 表情。全部 [a-z0-9_]+ で、ぶつからない", () => {
    expect(wearKind("jacket")).toBe("wear_jacket");
    expect(wearKind("chefJacket")).toBe("wear_chef_jacket");
    expect(wearKind("businessSuit")).toBe("wear_business_suit");
    expect(wearKind("fullHarness")).toBe("wear_full_harness");
    const kinds = ASSET_LIST.map((a) => a.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.every((k) => KIND_RE.test(k))).toBe(true);
    expect(ASSET_LIST.filter((a) => a.group === "wear")).toHaveLength(GARMENTS.length);
    expect(ASSET_LIST.filter((a) => a.group === "face").map((a) => a.kind)).toEqual(EXPRESSIONS.map((e) => `face_${e}`));
    // 頭の文字で部類を分ける。小物の名前は wear_ / face_ で始まらない
    for (const a of ASSET_LIST) expect(groupOfKind(a.kind), a.kind).toBe(a.group);
    expect(groupOfKind("Bad Kind")).toBeNull();
  });
});

describe("色は灰色（R=G=B）に直す", () => {
  it("明るさを保って灰色へ寄せる。none と TONE はそのまま。読めない色は中くらいの灰色", () => {
    expect(grayColor("#ff0000")).toBe("#4c4c4c");
    expect(grayColor("#fff")).toBe("#ffffff");
    expect(grayColor("#000000")).toBe("#000000");
    expect(grayColor("#bfbfbf")).toBe("#bfbfbf");
    expect(grayColor("rgb(0, 0, 255)")).toBe("#1d1d1d");
    expect(grayColor("rgb(100%,100%,100%)")).toBe("#ffffff");
    expect(grayColor("Yellow")).toBe("#e2e2e2");
    expect(grayColor("none")).toBe("none");
    expect(grayColor("TONE")).toBe("TONE");
    expect(grayColor("url(#a)")).toBe("#808080");
    expect(grayColor("nonsense")).toBe("#808080");
    for (const c of ["#123", "#abcdef", "#FFEEDD", "rgb(10,200,30)", "orange", "navy", "x"]) expect(isGray(grayColor(c)), c).toBe(true);
  });

  it("fill と stroke の値だけを直し、stroke-width などはそのまま。sanitize のあとにかけると小物にも服にも効く", () => {
    const g = grayifySvg('<rect x="1" fill="#f00" stroke="rgb(0,128,255)" stroke-width="3" fill-opacity="0.5"/><path fill="TONE" stroke="none" d="M0 0"/>');
    expect(g).toContain('stroke-width="3"');
    expect(g).toContain('fill-opacity="0.5"');
    expect(g).toContain('fill="TONE"');
    expect(g).toContain('stroke="none"');
    expect(grayOnly(g)).toBe(true);
    const c = cleanAssetSvg('<g fill="red"><circle cx="5" cy="5" r="3" fill="#00ff00" onclick="x()"/></g><script>1</script>');
    expect(c).not.toMatch(/onclick|script|red|#00ff00/);
    expect(grayOnly(c)).toBe(true);
    expect(c).toContain("<circle");
    // sanitize は TONE を残す
    expect(cleanAssetSvg('<rect x="0" y="0" width="5" height="5" fill="TONE"/>')).toContain('fill="TONE"');
    expect(cleanAssetSvg("<text>字</text>")).toBe("");
  });
});

describe("服の差し替え", () => {
  it("枠: 向きごとに胴の幅 + 20 の左右、y は −175〜140。今の 22 の服は 3 つの向きとも全部収まる", () => {
    expect(wearFrame("front")).toEqual({ x: -66, y: -175, w: 132, h: 315 });
    expect(wearFrame("quarter")).toEqual({ x: -66, y: -175, w: 132, h: 315 });
    expect(wearFrame("side")).toEqual({ x: -50, y: -175, w: 100, h: 315 });
    expect(TORSO_HALF).toEqual({ front: 46, quarter: 46, side: 30 });
    const bad: string[] = [];
    for (const view of VIEWS)
      for (const g of GARMENTS) {
        const f = wearFrame(view);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}" height="${f.h}" viewBox="${f.x} ${f.y} ${f.w} ${f.h}">${garmentBase(view, g)}</svg>`;
        // 枠のすぐ外（枠を 1 画素ずつ広げた絵）にも塗りが無いこと = 枠の端で切れていない
        const wide = `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w + 40}" height="${f.h + 40}" viewBox="${f.x - 20} ${f.y - 20} ${f.w + 40} ${f.h + 40}">${garmentBase(view, g)}</svg>`;
        const px = new Resvg(wide).render().pixels;
        const W = f.w + 40;
        let out = 0;
        for (let y = 0; y < f.h + 40; y++)
          for (let x = 0; x < W; x++) if ((x < 20 || x >= W - 20 || y < 20 || y >= f.h + 20) && px[(y * W + x) * 4 + 3] > 0) out++;
        if (out) bad.push(`${view}・${g}: 枠の外に ${out} 画素`);
        expect(() => new Resvg(svg).render()).not.toThrow();
      }
    expect(bad).toEqual([]);
  }, 120000);

  it("元の服は主な塗りが TONE の名前で渡る。差し替えの形は 3 つの向き全部が要り、1 つでも空なら登録されない", () => {
    expect(wearBaseBodies("jacket").front).toContain('fill="TONE"');
    expect(wearBaseBodies("jacket").front).not.toContain('fill="#ccc"');
    const shapes = { front: "<g/>", quarter: "<g/>", side: "<g/>" };
    expect(parseWear(stringifyWear(shapes))).toEqual(shapes);
    expect(parseWear(JSON.stringify({ ...shapes, side: "" }))).toBeNull();
    expect(parseWear("壊れた")).toBeNull();
    setPropOverrides({ wear_jacket: JSON.stringify({ ...shapes, side: "" }), wear_polo: stringifyWear(shapes) });
    expect(wearOverride("wear_jacket")).toBeUndefined();
    expect(wearOverride("wear_polo")).toEqual(shapes);
    // 読めない登録・名前の形が違う登録は、描くときに邪魔をしない
    setPropOverrides({ "Bad Kind": "x", face_anger: "壊れた", wear_coat: "[]" });
    expect(outfitTorso("front", { wear: [{ kind: "coat" }] })).toBe(outfitTorso("front", { wear: [{ kind: "coat" }] }));
  });

  it("差し替えは枠の入れ子の <svg>（overflow hidden）に包まれ、TONE はその服の明るさに置き換わり、枠の外は描かれない", () => {
    const rect = '<rect x="-300" y="-300" width="600" height="600" fill="TONE"/>';
    for (const view of VIEWS) {
      const f = wearFrame(view);
      const svg = wearSvg(rect, view, "#abcdef");
      expect(svg).toBe(`<svg x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" viewBox="${f.x} ${f.y} ${f.w} ${f.h}" overflow="hidden"><rect x="-300" y="-300" width="600" height="600" fill="#abcdef"/></svg>`);
      // 画素で: 枠の中は塗られ、枠の外は塗られない
      const px = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="-200 -250 400 500">${svg}</svg>`).render().pixels;
      const at = (x: number, y: number) => px[((y + 250) * 400 + (x + 200)) * 4 + 3] > 0;
      expect(at(0, 0)).toBe(true);
      expect(at(f.x + 2, f.y + 2)).toBe(true);
      expect(at(f.x + f.w - 3, f.y + f.h - 3)).toBe(true);
      expect(at(f.x - 3, 0)).toBe(false);
      expect(at(f.x + f.w + 2, 0)).toBe(false);
      expect(at(0, f.y - 3)).toBe(false);
      expect(at(0, f.y + f.h + 2)).toBe(false);
    }
    expect(wearSvg("<g fill=\"TONE\"/>", "front", "url(#x)")).toContain('fill="#808080"');
  });

  it("差し替えた服は、その服の層だけが入れ替わる（重なりの順と part_ の id は元のまま。体・腕・脚・顔は元のまま）", () => {
    const o = { wear: [{ kind: "skirt" as const }, { kind: "jacket" as const, tone: "#999" }], neck: "tie" as const };
    const shapes = { front: '<rect x="-20" y="-120" width="40" height="40" fill="TONE" stroke="#000"/>', quarter: '<circle cx="0" cy="-100" r="9" fill="TONE"/>', side: '<path d="M0 -130H9V-90Z" fill="TONE"/>' };
    const base = Object.fromEntries(VIEWS.map((v) => [v, outfitTorso(v, o)]));
    setPropOverrides({ wear_jacket: stringifyWear(shapes) });
    for (const v of VIEWS) {
      const got = outfitTorso(v, o);
      expect([...got.matchAll(/id="part_(\w+)"/g)].map((m) => m[1])).toEqual(["skirt", "jacket", "neck"]);
      // スカートとネクタイは元と同じ文字列
      expect(got.slice(0, got.indexOf('<g id="part_jacket">'))).toBe(base[v].slice(0, base[v].indexOf('<g id="part_jacket">')));
      expect(got.slice(got.indexOf('<g id="part_neck">'))).toBe(base[v].slice(base[v].indexOf('<g id="part_neck">')));
      expect(got).toContain(shapes[v].replace("TONE", "#999"));
    }
    // 差し替えをやめると元の絵と 1 文字も変わらない
    clearPropOverrides();
    for (const v of VIEWS) expect(outfitTorso(v, o)).toBe(base[v]);
    // 全身で描いても、体の側（腕・脚・顔）は差し替えの有無で変わらない
    const fig = (view: View) => characterSvg({ angles: A_POSE[view], x: 100, groundY: 300, height: 270, facing: "right", view, role: "new", hair: "bob", headwear: "none", outfit: o });
    const plain = fig("front");
    setPropOverrides({ wear_jacket: stringifyWear(shapes) });
    const swapped = fig("front");
    expect(swapped).not.toBe(plain);
    const without = (x: string) => x.replace(/<g id="part_jacket">.*?<\/g>/, "");
    expect(without(swapped)).toBe(without(plain));
  });

  it("見本は 22 の服 × 3 つの向きで描け、差し替えの有無で変わる", () => {
    for (const a of ASSET_LIST.filter((x) => x.group === "wear")) {
      for (const v of VIEWS) expect(() => new Resvg(wearPreviewSvg(a.kind, undefined, v)).render(), `${a.kind} ${v}`).not.toThrow();
      const swap = stringifyWear({ front: '<rect x="-10" y="-100" width="20" height="20" fill="TONE"/>', quarter: '<rect x="-10" y="-100" width="20" height="20" fill="TONE"/>', side: '<rect x="-10" y="-100" width="20" height="20" fill="TONE"/>' });
      expect(wearPreviewSvg(a.kind, swap)).not.toBe(wearPreviewSvg(a.kind, null));
      expect(wearPreviewSvg(a.kind, null)).toBe(wearPreviewSvg(a.kind));
    }
    expect(assetPreviewSvg("wear_jacket", null)).toBe(wearPreviewSvg("wear_jacket", null));
  }, 120000);
});

describe("表情の差し替え（部品の組み合わせ）", () => {
  it("数は全部決まった幅に収め、知らない値・数でない値は既定に戻す", () => {
    expect(normalizeRig({ eyes: "wide", brows: { inner: -99, outer: 0 }, mouth: "clench", mouthWidth: 9 })).toEqual({ eyes: "wide", brows: { inner: BROW_Y[0], outer: BROW_Y[1] }, mouth: "clench", mouthWidth: MOUTH_WIDTH[1] });
    expect(normalizeRig({ mouthWidth: 0.1 }).mouthWidth).toBe(MOUTH_WIDTH[0]);
    // どなる口だけは、広げすぎると真横の下の角が輪郭の外へ出るので上限が低い
    expect(normalizeRig({ mouth: "shout", mouthWidth: 1.4 }).mouthWidth).toBe(1.25);
    expect(normalizeRig({ mouth: "smile", mouthWidth: 1.4 }).mouthWidth).toBe(1.4);
    expect(normalizeRig({ eyes: "bogus", brows: "bogus", mouth: "bogus", mouthWidth: "広く" })).toEqual(DEFAULT_RIG);
    expect(normalizeRig({ brows: { inner: -50 } }).brows).toBe("own");
    expect(normalizeRig({ brows: { inner: Number.NaN, outer: -50 } }).brows).toBe("own");
    expect(normalizeRig({ brows: { inner: "x", outer: -50 } }).brows).toBe("own");
    expect(normalizeRig(null)).toEqual(DEFAULT_RIG);
    expect(normalizeRig("怒る")).toEqual(DEFAULT_RIG);
    expect(normalizeRig({ brows: "raised", mouthWidth: 1.234567 })).toMatchObject({ brows: "raised", mouthWidth: 1.23 });
    expect(parseFace("[]")).toBeNull();
    expect(parseFace("壊れた")).toBeNull();
    expect(parseFace('{"mouth":"flat"}')).toEqual({ ...DEFAULT_RIG, mouth: "flat" });
    // 今の 9 つの表情の眉の高さは、決めた幅に収まっている
    for (const e of EXPRESSIONS) {
      const b = expressionRig(e).brows;
      if (typeof b === "object") for (const y of [b.inner, b.outer]) expect(y >= BROW_Y[0] && y <= BROW_Y[1], e).toBe(true);
      expect(normalizeRig(expressionRig(e))).toEqual(expressionRig(e));
    }
  });

  const paint = (body: string) => {
    const px = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><g transform="translate(100 180)">${body}</g></svg>`).render().pixels;
    return (x: number, y: number) => px[((y + 180) * 200 + (x + 100)) * 4 + 3] > 0;
  };
  const RIGS: ExprRig[] = [
    { eyes: "wide", brows: { inner: BROW_Y[0], outer: BROW_Y[1] }, mouth: "clench", mouthWidth: MOUTH_WIDTH[1] },
    { eyes: "pinched", brows: "raised", mouth: "smallO", mouthWidth: MOUTH_WIDTH[0] },
    { eyes: "closedArc", brows: "own", mouth: "openSmile", mouthWidth: MOUTH_WIDTH[1] },
    { eyes: "open", brows: { inner: BROW_Y[1], outer: BROW_Y[0] }, mouth: "shout", mouthWidth: MOUTH_WIDTH[1] },
    { eyes: "open", brows: "own", mouth: "frown", mouthWidth: MOUTH_WIDTH[1] },
    { eyes: "open", brows: "raised", mouth: "wave", mouthWidth: MOUTH_WIDTH[1] },
    { eyes: "open", brows: { inner: -48, outer: -48 }, mouth: "flat", mouthWidth: MOUTH_WIDTH[1] },
    { eyes: "open", brows: "own", mouth: "smile", mouthWidth: MOUTH_WIDTH[1] },
  ];

  it("差し替えた表情は、3 つの向き × 4 つの顔の形 × 3 つの大きさのどれでも描け、顔の部品が輪郭の外へ出ない", () => {
    const bad: string[] = [];
    for (const face of FACE_OPTIONS.face)
      for (const faceSize of FACE_OPTIONS.faceSize)
        for (const view of VIEWS) {
          const f = { ...DEFAULT_FACE, face, faceSize };
          const faceAt = paint(`<path d="${faceOutline(face, faceSize)}" fill="#fff" stroke="#000" stroke-width="5"/>`);
          const plain = faceSvg(view, f, 0, { expression: "anger" });
          for (const [i, rig] of RIGS.entries()) {
            setPropOverrides({ face_anger: JSON.stringify(rig) });
            const svg = faceSvg(view, f, 0, { expression: "anger" });
            expect(svg, `${view} ${face} ${i}`).not.toMatch(/NaN|undefined/);
            expect(svg).not.toBe(plain);
            const inner = svg.replace(/<path d="M[^"]*Z" fill="#(fff|e6e6e6)" stroke="#000" stroke-width="5" stroke-linejoin="round"\/>/, "");
            const px = paint(inner);
            let out = 0;
            for (let y = -180; y < 20; y++) for (let x = -100; x < 100; x++) if (px(x, y) && !faceAt(x, y)) out++;
            if (out) bad.push(`${view} ${face} ${faceSize} 組み合わせ ${i}: ${out} 点`);
          }
          clearPropOverrides();
          expect(faceSvg(view, f, 0, { expression: "anger" })).toBe(plain);
        }
    expect(bad).toEqual([]);
  }, 120000);

  it("眼鏡・ひげ・目の形・傾きと組んでも描け、差し替えていない表情は変わらない。話す口は表情の口より先、寝ている絵は差し替えた pain", () => {
    const rig: ExprRig = { eyes: "closedArc", brows: { inner: -50, outer: -44 }, mouth: "frown", mouthWidth: 0.8 };
    setPropOverrides({ face_pain: JSON.stringify(rig) });
    for (const view of VIEWS)
      for (const eyeShape of [...FACE_OPTIONS.eyeShape, "white" as const])
        for (const beard of [...FACE_OPTIONS.beard, "stubble" as const])
          for (const tilt of [0, 6]) {
            const f = { ...DEFAULT_FACE, eyeShape, beard, glasses: "round" as const, lashes: "three" as const };
            const svg = faceSvg(view, f, tilt, { expression: "pain" });
            expect(svg).not.toMatch(/NaN|undefined/);
            expect(svg).toContain("<path");
          }
    // 表情の差し替えは、その表情だけに効く
    clearPropOverrides();
    const joy = faceSvg("front", DEFAULT_FACE, 0, { expression: "joy" });
    setPropOverrides({ face_pain: JSON.stringify(rig) });
    expect(faceSvg("front", DEFAULT_FACE, 0, { expression: "joy" })).toBe(joy);
    // 話す口は表情の口より先（差し替えた口の形・幅は使わない）
    const hole = (s: string) => s.match(/<ellipse[^>]*fill="#000" stroke="#000" stroke-width="2"\/>/)?.[0];
    setPropOverrides({ face_anger: JSON.stringify({ ...rig, mouthWidth: 1.4 }) });
    const said = faceSvg("front", DEFAULT_FACE, 0, { expression: "anger", speak: "a" });
    expect(hole(said)).toBeTruthy();
    expect(hole(said)).toBe(hole(faceSvg("front", DEFAULT_FACE, 0, { expression: "neutral", speak: "a" })));
    // 寝ている絵（胴を 75 度より倒した）は、差し替えた pain を使う
    setPropOverrides({ face_pain: JSON.stringify(rig) });
    const lying = characterSvg({ angles: { ...A_POSE.side, torso: 80 }, x: 100, groundY: 300, height: 270, facing: "right", view: "side", role: "new", hair: "bob", headwear: "none", expression: "joy" });
    expect(lying).toContain(faceSvg("side", DEFAULT_FACE, 0, { expression: "pain" }));
    clearPropOverrides();
    expect(lying).not.toContain(faceSvg("side", DEFAULT_FACE, 0, { expression: "pain" }));
  });

  it("見本は 9 つの表情 × 3 つの向きで描け、差し替えの有無で変わる", () => {
    for (const a of ASSET_LIST.filter((x) => x.group === "face")) {
      for (const v of VIEWS) expect(() => new Resvg(facePreviewSvg(a.kind, undefined, v)).render(), `${a.kind} ${v}`).not.toThrow();
      expect(facePreviewSvg(a.kind, JSON.stringify(RIGS[0]))).not.toBe(facePreviewSvg(a.kind, null));
      expect(facePreviewSvg(a.kind, null)).toBe(facePreviewSvg(a.kind));
    }
  });
});
