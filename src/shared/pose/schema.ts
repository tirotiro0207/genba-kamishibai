// 仮の人形の姿勢の形（005）。関節の角度・小物・視線を数字で持つ。正式な骨格は 015 で作り直す。

export const JOINTS = [
  "torso", "head",
  "arm_l_upper", "arm_l_lower", "arm_r_upper", "arm_r_lower",
  "leg_l_upper", "leg_l_lower", "leg_r_upper", "leg_r_lower",
] as const;
export type Joint = (typeof JOINTS)[number];

/** 角度の範囲（度）。torso は 0 で直立・正で前へ倒す。腕と脚の upper は真下が 0、正で前へ。lower は upper に対する曲げ */
export const JOINT_RANGE: Record<Joint, [number, number]> = {
  torso: [-100, 100],
  head: [-60, 60],
  arm_l_upper: [-180, 200],
  arm_l_lower: [-10, 160],
  arm_r_upper: [-180, 200],
  arm_r_lower: [-10, 160],
  leg_l_upper: [-60, 150],
  leg_l_lower: [-160, 10],
  leg_r_upper: [-60, 150],
  leg_r_lower: [-160, 10],
};

export const PROPS = [
  "helmet", "harness", "hook", "anchor_bar", "voltage_tester", "wire", "panel", "tag", "lock",
  "suspended_load", "crane_hook", "arrow_down", "distance_arrow", "broom", "box", "trash_bin",
  "clock", "checklist", "check", "thermometer", "speech_bubble", "stop_hand", "warning_triangle", "bed",
] as const;
export type Prop = (typeof PROPS)[number];
export const ATTACH = ["hand_l", "hand_r", "head", "waist", "free"] as const;

export interface Figure {
  x: number;
  scale: number;
  facing: "left" | "right";
  pointing: boolean;
  mouth_open: boolean;
  /** 視線の向き（度）。0 で正面（向いている側）、正で上、負で下 */
  gaze: number;
  angles: Record<Joint, number>;
}

export interface PropPlacement {
  kind: Prop;
  attach: (typeof ATTACH)[number];
  figure: number;
  x: number;
  y: number;
  size: number;
}

export interface Pose {
  figures: Figure[];
  props: PropPlacement[];
  overlay: { prohibit: boolean; mark: "none" | "circle" | "cross" };
}

const num = { type: "number" } as const;

/** モデルに渡す JSON Schema（構造だけ。範囲は validatePose で確かめる） */
export const POSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["figures", "props", "overlay"],
  properties: {
    figures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "scale", "facing", "pointing", "mouth_open", "gaze", "angles"],
        properties: {
          x: num, scale: num, gaze: num,
          facing: { type: "string", enum: ["left", "right"] },
          pointing: { type: "boolean" },
          mouth_open: { type: "boolean" },
          angles: { type: "object", additionalProperties: false, required: [...JOINTS], properties: Object.fromEntries(JOINTS.map((j) => [j, num])) },
        },
      },
    },
    props: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "attach", "figure", "x", "y", "size"],
        properties: {
          kind: { type: "string", enum: [...PROPS] },
          attach: { type: "string", enum: [...ATTACH] },
          figure: { type: "integer" }, x: num, y: num, size: num,
        },
      },
    },
    overlay: {
      type: "object",
      additionalProperties: false,
      required: ["prohibit", "mark"],
      properties: { prohibit: { type: "boolean" }, mark: { type: "string", enum: ["none", "circle", "cross"] } },
    },
  },
} as const;

/** 範囲の検査。問題の一覧を返す（空なら通る） */
export function validatePose(p: Pose): string[] {
  const errs: string[] = [];
  const inRange = (v: unknown, lo: number, hi: number, name: string) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) errs.push(`${name} が範囲の外（${lo}〜${hi}）: ${String(v)}`);
  };
  if (!Array.isArray(p.figures) || p.figures.length < 1 || p.figures.length > 2) errs.push("人物は 1〜2 人");
  (p.figures ?? []).forEach((f, i) => {
    inRange(f.x, 0, 1, `figures[${i}].x`);
    inRange(f.scale, 0.4, 1.3, `figures[${i}].scale`);
    inRange(f.gaze, -90, 90, `figures[${i}].gaze`);
    if (f.facing !== "left" && f.facing !== "right") errs.push(`figures[${i}].facing`);
    for (const j of JOINTS) inRange(f.angles?.[j], ...JOINT_RANGE[j], `figures[${i}].angles.${j}`);
  });
  if (!Array.isArray(p.props) || p.props.length > 8) errs.push("小物は 8 つまで");
  (p.props ?? []).forEach((pr, i) => {
    if (!(PROPS as readonly string[]).includes(pr.kind)) errs.push(`props[${i}].kind`);
    if (!(ATTACH as readonly string[]).includes(pr.attach)) errs.push(`props[${i}].attach`);
    if (pr.attach !== "free" && (pr.figure < 0 || pr.figure >= (p.figures?.length ?? 0))) errs.push(`props[${i}].figure が人物の番号の外`);
    inRange(pr.x, 0, 1, `props[${i}].x`);
    inRange(pr.y, 0, 1, `props[${i}].y`);
    inRange(pr.size, 0.04, 0.45, `props[${i}].size`);
  });
  if (!p.overlay || !["none", "circle", "cross"].includes(p.overlay.mark)) errs.push("overlay.mark");
  return errs;
}
