// 仮の関節の角度（005）。守ることから、1 枚の絵の姿勢と小物を Sonnet に数字で決めさせる。
import type Anthropic from "@anthropic-ai/sdk";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import { ATTACH, JOINT_RANGE, JOINTS, type Pose, POSE_JSON_SCHEMA, PROPS, validatePose } from "./schema";

export const ANGLES_MODEL = "claude-sonnet-5-5";

const ranges = JOINTS.map((j) => `${j}: ${JOINT_RANGE[j][0]}〜${JOINT_RANGE[j][1]}`).join(" / ");

const SYSTEM = `あなたは、安全の決まりを 1 枚の絵にするため、人形の姿勢と小物を数字で決める係です。
絵の面に文字は入れられない。色は黒とグレー、禁止の赤い円と斜線だけ。
キャンバスは正方形。x と y は 0〜1（左上が 0,0。地面は y=0.85）。
人物は 1〜2 人。x は腰の位置、scale は 0.4〜1.3、facing は向き、gaze は視線（度。0 で前、正で上、負で下、-90〜90）。
角度は度。torso は 0 で直立・正で前へ倒す。腕と脚の upper は真下を 0、正で前へ回す（180 で真上）。lower は upper に対する曲げ。
角度の範囲: ${ranges}
小物 kind: ${PROPS.join(", ")}（8 つまで。size は 0.04〜0.45）
attach: ${ATTACH.join(" / ")}。free のときだけ x と y を使う。figure は付ける人物の番号（0 から）
overlay: prohibit は禁止の赤い円と斜線を全体に重ねるか。mark は none / circle / cross
1 枚で「守ること」が一目で伝わる構図にする。小物は要るものだけ。`;

export function anglesParams(rule: string, why?: string, feedback?: string): Anthropic.MessageCreateParamsNonStreaming {
  let content = `守ること: ${rule}\n理由: ${why || "（書いていない）"}\nこの決まりの 1 枚の絵の数字を決めてください。`;
  if (feedback) content += `\n\n前の絵は伝わらなかった。${feedback}\n直した数字を出してください。`;
  return {
    model: ANGLES_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: POSE_JSON_SCHEMA } },
    messages: [{ role: "user", content }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

export function parsePose(msg: Anthropic.Message): Pose {
  if (msg.stop_reason !== "end_turn") throw new Error(`角度が最後まで返らなかった: ${msg.stop_reason}`);
  const pose = JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as Pose;
  const errs = validatePose(pose);
  if (errs.length) throw new Error(`姿勢の数字が範囲の外: ${errs.slice(0, 3).join(" / ")}`);
  return pose;
}

export async function decidePose(deps: GuardedDeps, purpose: Purpose, rule: string, why?: string, feedback?: string): Promise<Pose> {
  const msg = await guardedCall(deps, { purpose, label: "関節の角度", params: anglesParams(rule, why, feedback) });
  return parsePose(msg);
}
