// 守ることから、正式な絵の数字を AI に決めさせる（079b で作り方を比べる）。
// angles: 1 枚の絵の関節と小物を決める / motion: 動きのキーフレームを書かせ、印の 3〜4 か所をコマにする
import type Anthropic from "@anthropic-ai/sdk";
import { type GuardedDeps, guardedCall, type Purpose } from "../claude";
import { cutFrames, FRAME_JSON_SCHEMA, type FrameJson, keyToFrame, MARKS_MAX, MARKS_MIN, MAX_DURATION, MOTION_JSON_SCHEMA, type MotionJson, validateFrameJson, validateMotion } from "./motion";
import { FIXED_MIN, FREE_MAX, POSES } from "./poses";
import { DEFAULT_JOINT, PROP_KINDS } from "./props";
import { type Frame, GROUND, WALL } from "./scene";
import { BONE_RANGE, BONES } from "./skeleton";

export type DrawMode = "angles" | "motion";

const ranges = BONES.map((b) => `${b}: ${BONE_RANGE[b][0]}〜${BONE_RANGE[b][1]}`).join(" / ");
const poses = Object.entries(POSES).map(([k, a]) => `${k}: ${JSON.stringify(a)}`).join("\n");
const props = PROP_KINDS.filter((k) => !["helmet", "helmet_new", "cap_lead"].includes(k)).map((k) => `${k}${DEFAULT_JOINT[k] ? `（ふつうは ${DEFAULT_JOINT[k]} に付ける）` : ""}`).join(", ");

const COMMON = `あなたは、安全の決まりをピクトグラムの絵にするため、人形の姿勢と小物を数字で決める係です。
絵の面に文字は置けない。色は黒とグレー。赤は小物 prohibit（禁止の赤い円と斜線）だけ。○と× は circle_mark・cross_mark。
キャンバスは正方形で、全体を枠で囲む。左の x 0〜${WALL} は薄いグレーの壁（盤・コンセントなど壁の道具を置く場所。高さは y 0.35〜0.6 あたり）。床の線は y ${GROUND}。人物は 1〜3 人。
人物: role は役（new＝新人・白いヘルメット / lead＝上の人・黒い帽子 / worker＝ほかの作業の人・グレーのヘルメット）。かぶり物は役から自動で付くので、小物に helmet・helmet_new・cap_lead を入れない。
x は腰の横の位置（0〜1）、height は背の高さ（基本は 0.48〜0.56。枠の高さの 6 割くらいを人が占める）、facing は向き（left / right）。人と道具は大きく描き、枠の中を空けすぎない。
角度は度。torso は胴の前への傾き、neck は頭の前への傾き（正でうつむく）。腕と脚の upper は真下を 0 として前へ回すと正、lower は upper に対する曲げ。
角度の範囲: ${ranges}
姿勢の手本（角度）:
${poses}
人物の角度は、必ず手本のどれか 1 つを土台にする。土台の 10 の関節のうち ${FIXED_MIN} つ以上は手本の数のまま変えず、動かしてよいのは ${10 - FIXED_MIN} つまで、1 つ ±${FREE_MAX} 度まで（ひじだけ少し曲げる、首だけ少し上げる、など）。
手本に無い動きも、いちばん近い手本から少しだけ変えて作る。キーフレームの間の動きも、手本と手本の間をつなぐ形にする。
小物 kind: ${props}
小物の置き場: figure に人物の番号（0 から）と joint と、背の高さに対するずれ dx・dy（-1〜1。dx は向いている側が正）。
キャンバスに置くときは figure を -1 にし、x・y（0〜1、左上が 0,0）を使う。使わない値は 0。size はキャンバスの幅に対する大きさ（0.04〜0.5）。
show が false の小物はそのコマに描かない（吹き出しをコマごとに出し入れする）。inner は吹き出しの中に描く道具で、吹き出しでなければ "none"。
吹き出し: 迷う・考えるは think_question / think_check（点線の吹き出しと小さい丸）、話すは bubble_question / bubble_check（しっぽ）。
人に付けるときは joint を head、dy を -0.4 前後、size を 0.24〜0.3 にする。中に何について迷う・確かめたかの道具を inner で入れ、「？」か「✓」と並べる。
危ない・おかしいと知らせるのは bubble_alert（「！」と中の物）、記号の無い話は bubble_say（中の物だけ）。spark は火花（盤・コンセント・電線のそばに置く）。elapsed_10min などは、たった時間の札（時計と「10min」。キャンバスの上の方に置く）。
check_mark は確かめた印（黒い丸に ✓）。panel・outlet は壁に置く道具、toolbox は床に置く道具箱。
「守ること」が文字なしで一目で伝わる構図にする。迷う・聞く・確かめた、は吹き出しで見せる。小物は要るものだけ。`;

const SYSTEM: Record<DrawMode, string> = {
  angles: `${COMMON}\n1 枚の絵の数字を決めてください。`,
  motion: `${COMMON}
決まりを短い動き（0〜${MAX_DURATION} 秒）として、キーフレームで書いてください。最初のキーフレームの時刻は 0。時刻は前より後。
どのキーフレームも人数と小物の並び（kind と、人物に付けるかキャンバスに置くか）は同じにする。間は描く側が補う。
意味が変わる時刻（たとえば、危ない場面 → 気づく → 正しくする）の ${MARKS_MIN}〜${MARKS_MAX} か所に mark: true を付ける。そこがカードのコマになる。`,
};

export function drawParams(model: string, mode: DrawMode, rule: string, why?: string, fix?: string): Anthropic.MessageCreateParamsNonStreaming {
  let content = `守ること: ${rule}\n理由: ${why || "（書いていない）"}`;
  if (fix) content += `\n\n前の答えは範囲の外だった: ${fix}\n直した数字を出してください。`;
  return {
    model,
    max_tokens: 16000,
    system: SYSTEM[mode],
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: mode === "angles" ? FRAME_JSON_SCHEMA : MOTION_JSON_SCHEMA } },
    messages: [{ role: "user", content }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

function textOf(msg: Anthropic.Message): string {
  if (msg.stop_reason !== "end_turn") throw new Error(`絵の数字が最後まで返らなかった: ${msg.stop_reason}`);
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

export interface Drawn {
  /** カードのコマ（angles は 1 つ、motion は 3〜4） */
  frames: Frame[];
  json: FrameJson | MotionJson;
  messages: Anthropic.Message[];
}

/** 数字を決めさせる。範囲の外なら、その中身を渡して 1 回だけ呼び直す */
export async function drawCard(deps: GuardedDeps, purpose: Purpose, model: string, mode: DrawMode, rule: string, why?: string): Promise<Drawn> {
  const messages: Anthropic.Message[] = [];
  let fix: string | undefined;
  for (let i = 0; i < 2; i++) {
    const msg = await guardedCall(deps, { purpose, label: `絵の数字（${mode}）`, params: drawParams(model, mode, rule, why, fix) });
    messages.push(msg);
    const json = JSON.parse(textOf(msg));
    const errs = mode === "angles" ? validateFrameJson(json) : validateMotion(json);
    if (!errs.length) {
      const frames = mode === "angles" ? [keyToFrame(json as FrameJson)] : cutFrames(json as MotionJson).map((c) => c.frame);
      return { frames, json, messages };
    }
    fix = errs.slice(0, 5).join(" / ");
  }
  throw new Error(`絵の数字が 2 回とも範囲の外: ${fix}`);
}
