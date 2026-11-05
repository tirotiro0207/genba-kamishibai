import { describe, expect, it } from "vitest";
import { characterSvg } from "../src/shared/picto/character";
import { derivedFrom, POSE_NAMES, POSES, poseAngles, stickJoints, stickSvg, vary, viewFor } from "../src/shared/picto/poses";
import { renderFrame } from "../src/shared/picto/scene";
import { posePoints, validateFigure } from "../src/shared/picto/skeleton";
import { checkStyle } from "../src/shared/picto/style";

const at = (name: keyof typeof POSES) => posePoints({ x: 0.5, height: 0.62, facing: "right", angles: POSES[name] }, 768, 660).joints;

describe("主な姿勢 4 つ（016a）", () => {
  it("4 つとも範囲の中で、絵柄のテストが通る", () => {
    expect(POSE_NAMES.slice(0, 4)).toEqual(["stand", "point", "squat", "raise_hand"]);
    for (const name of POSE_NAMES) {
      for (const facing of ["right", "left"] as const) {
        const f = { x: 0.5, height: 0.62, facing, angles: POSES[name] };
        expect(validateFigure(f), name).toEqual([]);
        expect(checkStyle(renderFrame({ figures: [f] }).svg), name).toEqual([]);
      }
    }
  });

  it("姿勢ごとの形の特徴が出ている", () => {
    const point = at("point");
    expect(Math.abs(point.hand_near[1] - point.shoulder[1])).toBeLessThan(15); // 指差す手は肩の高さ
    expect(point.hand_near[0] - point.shoulder[0]).toBeGreaterThan(100); // 前へ伸びる
    const raise = at("raise_hand");
    expect(raise.hand_near[1]).toBeLessThan(raise.head[1]); // 手は頭より上
    const squat = at("squat");
    const stand = at("stand");
    expect(squat.head[1] - stand.head[1]).toBeGreaterThan(120); // しゃがむと頭が低い
  });
});

describe("向きごとの角度（poseAngles）と棒人間", () => {
  it("正面は左右の手足が外へ開き、立ち姿で体の軸が傾かない", () => {
    for (const name of ["stand", "walk", "point"] as const) {
      const j = stickJoints(poseAngles(name, "front"), "front");
      // 左右の足首が腰の中心をはさんで、ほぼ同じだけ外にある（同じ側へ傾かない）
      expect(j.ankle[0][0], name).toBeLessThan(0);
      expect(j.ankle[1][0], name).toBeGreaterThan(0);
      expect(Math.abs(j.ankle[0][0] + j.ankle[1][0]), name).toBeLessThan(12);
    }
    // 横から見た角度をそのまま正面に渡すと、前後に振った左右の足が同じ側へ傾く
    const raw = stickJoints({ angles: POSES.walk, len: {} }, "front");
    expect(Math.abs(raw.ankle[0][0] + raw.ankle[1][0])).toBeGreaterThan(30);
  });

  it("名前の付いた姿勢は、どの向きでも角度と長さが数になり、棒人間とキャラが描ける", () => {
    for (const name of POSE_NAMES)
      for (const view of ["front", "quarter", "side"] as const) {
        const p = poseAngles(name, view);
        for (const v of [...Object.values(p.angles), ...Object.values(p.len)]) expect(Number.isFinite(v), `${name} ${view}`).toBe(true);
        for (const v of Object.values(p.len)) expect(v, `${name} ${view}`).toBeGreaterThan(0);
        expect(stickSvg(p, view)).toContain('data-part="stick"');
        expect(characterSvg({ angles: p.angles, len: p.len, x: 100, groundY: 306, height: 270, facing: "right", view, hair: "short" })).toContain("<");
      }
  });

  it("基本の動作の姿勢がそろい、正面で形が分かれる", () => {
    for (const name of ["lift", "carry", "push", "pull", "sit", "kneel", "look_up", "look_down", "bow", "wave", "stop", "check", "climb", "phone", "write", "run", "point_down", "reach_up", "trip"]) expect(POSE_NAMES).toContain(name);
    const sit = stickJoints(poseAngles("sit", "side"), "side");
    expect(Math.abs(sit.knee[1][1] - sit.hip[1])).toBeLessThan(10); // 座るとももが床と平ら
    // 正面の押す・引く・運ぶは同じ形にならない（手の位置が違う）
    const hand = (n: "push" | "pull" | "carry") => stickJoints(poseAngles(n, "front"), "front").hand[1];
    const [a, b, c] = [hand("push"), hand("pull"), hand("carry")];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1]) + Math.hypot(a[0] - c[0], a[1] - c[1]) + Math.hypot(b[0] - c[0], b[1] - c[1])).toBeGreaterThan(40);
    // 正面の転ぶは両腕を真上に挙げない（バンザイにしない）
    const fall = stickJoints(poseAngles("fall", "front"), "front");
    expect(fall.hand[0][1]).toBeGreaterThan(fall.head[1]);
  });

  it("両足で立つ姿勢は、どの向きでも左右の足首の高さがそろう（片足だけ浮かない）", () => {
    const planted = ["stand", "point", "squat", "raise_hand", "walk", "report", "hands", "lift", "carry", "push", "pull", "sit", "look_up", "look_down", "bow", "wave", "stop", "check", "phone", "write", "point_down", "reach_up"] as const;
    for (const name of planted)
      for (const view of ["front", "quarter", "side"] as const) {
        const j = stickJoints(poseAngles(name, view), view);
        expect(Math.abs(j.ankle[0][1] - j.ankle[1][1]), `${name} ${view}`).toBeLessThan(6);
      }
  });

  it("正面のももは、上や真横へ向かない（カメラを向いたももが横へ折れて見えない）", () => {
    for (const name of POSE_NAMES) {
      const { angles: a } = poseAngles(name, "front");
      for (const s of ["near", "far"] as const) expect(Math.abs(a[`leg_${s}_upper`]), `${name} ${s}`).toBeLessThan(75);
    }
  });

  it("胴は足の上にかぶせる（ももを上げた姿勢でも）。奥の足の影は向きで濃さが変わる", () => {
    const squat = poseAngles("squat", "side");
    const svg = characterSvg({ ...squat, x: 100, groundY: 306, height: 270, facing: "right", view: "side", hair: "short" });
    // 手前の足（腰の x 6）を描いたあとに、胴（ベストの裾の帯）が来る
    expect(svg.lastIndexOf("translate(6 0)")).toBeLessThan(svg.indexOf('stroke="#333" stroke-width="12"'));
    expect(poseAngles("stand", "front").shade).toEqual({});
    expect(poseAngles("stand", "quarter").shade).toEqual({ far: 0.35 });
    expect(poseAngles("stand", "side").shade).toEqual({ far: 0.75 });
    // 正面でも足が前後に開く姿勢は、後ろへ振った足に影を付ける
    expect(poseAngles("run", "front").shade).toEqual({ far: 0.35 });
  });
});

describe("動きの決まり（名前の付いた姿勢から 7 対 3 で派生させる）", () => {
  it("名前の付いた姿勢は、それ自身が土台になる", () => {
    for (const name of POSE_NAMES) expect(derivedFrom(POSES[name]).base, name).toBe(name);
  });
  it("3 つまでの関節を ±30 度まで変えた形は派生として通り、4 つ変えたり 30 度を超えたりすると通らない", () => {
    const ok = vary("walk", { arm_near_lower: 20, neck: -15, torso: 8 });
    expect(derivedFrom(ok)).toMatchObject({ base: "walk", worst: 20 });
    expect(derivedFrom(vary("walk", { arm_near_lower: 20, neck: -15, torso: 8, leg_far_lower: 12 })).base).toBeUndefined();
    expect(derivedFrom(vary("walk", { arm_near_upper: 45 })).base).toBeUndefined();
  });
  it("動きの大きい姿勢は正面で描かない（斜めにする）。止まっている姿勢は正面のまま", () => {
    expect(viewFor("run", "front")).toBe("quarter");
    expect(viewFor("run", "side")).toBe("side");
    expect(viewFor("stand", "front")).toBe("front");
  });
});
