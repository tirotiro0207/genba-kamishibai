// 小物の部品（017・018a・018b・058。11/5 に人の新しい絵柄に合わせて描き直し、業種の道具を足した）。
// 絵柄の決まりは docs/picto-design.md: 縁は黒で、太さはキャンバスに対して一定（人の縁と同じ。小物の大きさでは変えない）、
// 塗りは灰色の 7 段、角は丸く、線のつなぎ目と端は丸。重なった形は「縁の回 → 中身の回」の 2 回描きでつなぎ目の線を消す（手足と同じ）。
// 印（○・×・✓・禁止・矢印）だけは、大きさに合わせて太さを変える。
// 置き場所は数字で決める: 人形の関節に付ける（関節と、背の高さに対するずれ）か、キャンバスの上の位置。
// 吹き出しは、考える（点線と小さい丸）と話す（しっぽ）の 2 つ。中に道具の絵と「？」か「✓」を描く。
import { type Joint, type Posed, PROPORTION, type Pt } from "./skeleton";
// 11/5: 電気の現場の道具と保護具 17 個を足し、安全帯（置いたとき）と保護めがね（持つ・置くとき）を写真に合わせて描き直した。
// クレーンの先の近くに置いた吊り荷は、先の真下へ寄せてワイヤーでつなぐ

export const PROP_KINDS = [
  // 017
  "helmet", "helmet_new", "cap_lead", "harness", "tester", "wire", "panel", "bubble_question", "bubble_check",
  // 018a
  "suspended_load", "arrow_down", "broom", "box", "lock", "tag",
  // 018b
  "clock", "checklist", "prohibit", "circle_mark", "cross_mark",
  // 11/2 スケッチに合わせて足した
  "outlet", "toolbox", "check_mark", "think_question", "think_check",
  // 058 伝わらない絵を直すために足した
  "unwell", "span_arrow", "edge", "anchor_line", "trash_bin",
  // 11/5 業種が増えた分（docs/picto-design.md の表で、多くの業種で使う順）
  "cone", "barrier", "ladder", "stepladder", "fire_extinguisher", "first_aid", "gloves", "goggles",
  "knife", "hot_pot", "cart", "forklift", "spill", "bucket", "mop", "chemical", "gas_cylinder",
  "hammer", "wrench", "grinder", "gear", "sun", "water_bottle", "faucet", "radio",
  // 11/5 脚本の段で足りなかった物: 火花（電気の異常）、記号の無い話す吹き出し・「！」の吹き出し（異常を知らせる）、
  // たった時間の札（時計と「10min」。数字と min・h だけは線で描いて絵に入れる。作者の判断）
  "spark", "bubble_say", "bubble_alert", "elapsed_1min", "elapsed_5min", "elapsed_10min", "elapsed_30min", "elapsed_1h",
  // 11/5 電気の現場の道具と保護具（docs/props-2026-11-05.md）。着る物は outfit.ts にも人に着せた絵がある
  "aed", "cubicle", "wristband", "work_platform", "rolling_scaffold", "safety_shoes", "cut_gloves", "insulated_gloves",
  "voltage_detector", "cooling_vest", "step_stool", "armband", "crane", "insulated_boots", "dust_mask", "power_drill", "aerial_platform",
  // 11/6 作者の口の直し（8 枚）で足りなかった物: ちらつく電球・安定した電球（照明の良し悪し）、床の点線の範囲（吊り荷の下の立ち入り禁止）、
  // 低い仕切り（要る物と要らない物を分けた）、切れた電線（不具合を見つけた）、高さの札（「2m」。数字と単位だけを線で描く。たった時間の札と同じ扱い）
  "bulb_flicker", "bulb_steady", "danger_zone", "partition", "wire_broken", "height_2m",
  // 熱がある顔（体温計をくわえ、ほおに斜線、頭の上に湯気）。ふつうは吹き出しの中に入れて「体調が悪い」と伝える
  "fever",
  // 座る椅子（11/6。作者の指示）。今まで座るのに使っていた踏み台の代わり。背もたれのある、金属の脚の休憩所の椅子
  "chair",
  // 11/6 昼の 20 枚の作者の直しで足りなかった物: 明かりの消えた電球（光の線なし・ガラスはグレー）、漢字 4 文字の札 2 つ（「低圧停電」「安全確認」。
  // カードの右上の空きに置く。字は字形を塗りの path で持つ。たった時間の札と同じ扱いの例外。作者の判断）、安全の十字の印、
  // 吹き出しの中の「1…2…3 SEC」（数字・点々・SEC を線で描く。たった時間の札と同じ扱い）、元気に笑った顔（熱の顔と対）
  "bulb_off", "label_teiatsu", "label_anzen", "safety_cross", "count_3sec", "healthy",
  // 11/6 朝 作者「3 メートル離れる」: 人と人（人と吊り荷）のあいだの横の距離の矢印と「3m」の札
  "distance_3m",
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export type PropAnchor =
  | { figure: number; joint: Joint; dx?: number; dy?: number }
  | { x: number; y: number };

export interface PropSpec {
  kind: PropKind;
  at: PropAnchor;
  /** 大きさ（キャンバスの幅に対する割合。0.04〜0.5） */
  size: number;
  /** 吹き出しの中に描く道具（吹き出しだけ） */
  inner?: InnerKind;
  /**
   * 吹き出しの中の 2 つ目の道具（11/6）。あると inner と inner2 を左右に並べ、吹き出しの種類の印（？・✓・！）は描かず、
   * それぞれの道具の右上に inner_marks の印を付ける（「どっち？」「こっちは○・こっちは×」を 1 つの吹き出しで見せる）
   */
  inner2?: InnerKind;
  /** inner と inner2 に付ける印（左・右の順）。無ければ両方とも印なし */
  inner_marks?: [InnerMark, InnerMark];
  /** チェック表の行の数（11/6。2〜8。チェック表だけ）。無ければ 3 行 */
  rows?: number;
  /** チェック表の、上から何行に ✓ を付けるか（11/6。0〜rows。チェック表だけ）。無ければ 2（行が 2 より少なければ行の数） */
  checks?: number;
  /** チェック表の ✓ の欄の後ろに丸数字 ①〜⑧ を付ける（11/6。チェック表だけ） */
  numbered?: boolean;
  /** チェック表の行の頭（✓・丸数字の後ろ）に描く小さな絵（11/6。上の行から順に。"none" はその行に絵なし。チェック表だけ） */
  icons?: ChecklistIcon[];
}

/** チェック表の行の頭の小さな絵: 転倒（人がつまずいて倒れかける）か、吹き出しの中に描ける道具、"none" は絵なし（11/6） */
export type ChecklistIcon = "fall" | "none" | InnerKind;
export const CHECKLIST_ROWS_MIN = 2;
export const CHECKLIST_ROWS_MAX = 8;

/** 吹き出しの中の道具に付ける印: ？・○・×・無し */
export const INNER_MARKS = ["question", "circle", "cross", "none"] as const;
export type InnerMark = (typeof INNER_MARKS)[number];

/** 吹き出し。人に付けると、しっぽ（話す）か小さい丸（考える）がその人の頭へ向かう */
export const BUBBLES = new Set<PropKind>(["bubble_question", "bubble_check", "think_question", "think_check", "bubble_say", "bubble_alert"]);
/** たった時間の札と、その文字（線で描く） */
export const ELAPSED: Partial<Record<PropKind, string>> = { elapsed_1min: "1min", elapsed_5min: "5min", elapsed_10min: "10min", elapsed_30min: "30min", elapsed_1h: "1h" };
/** 吹き出しの中に描ける道具 */
export const INNER_KINDS = [
  "panel", "tester", "outlet", "wire", "harness", "lock", "tag", "box", "toolbox", "checklist", "suspended_load", "broom", "clock",
  "fire_extinguisher", "first_aid", "gloves", "goggles", "cone", "ladder", "chemical", "knife", "gear",
  "spark",
  "aed", "voltage_detector", "insulated_gloves", "dust_mask", "power_drill", "armband",
  // 11/6: 熱がある顔（体調が悪いと伝える）、2 つの電球、切れた電線
  "fever", "bulb_flicker", "bulb_steady", "wire_broken",
  // 11/6 昼: 消えた電球、「1…2…3 SEC」、元気な顔（熱の顔と対）、安全の十字
  "bulb_off", "count_3sec", "healthy", "safety_cross",
] as const;
export type InnerKind = (typeof INNER_KINDS)[number];

/** 人形の関節に付けるとき、どの関節が自然か（角度の係やキーフレームへの手がかり） */
export const DEFAULT_JOINT: Record<PropKind, Joint | null> = {
  helmet: "head",
  helmet_new: "head",
  cap_lead: "head",
  harness: "hip",
  tester: "hand_near",
  wire: "hand_near",
  panel: null,
  bubble_question: "head",
  bubble_check: "head",
  suspended_load: null,
  arrow_down: null,
  broom: "hand_near",
  box: "hand_near",
  lock: "hand_near",
  tag: "hand_near",
  clock: null,
  checklist: "hand_near",
  prohibit: null,
  circle_mark: null,
  cross_mark: null,
  outlet: null,
  toolbox: null,
  check_mark: null,
  think_question: "head",
  think_check: "head",
  unwell: "head",
  span_arrow: null,
  edge: null,
  anchor_line: "hip",
  trash_bin: null,
  cone: null,
  barrier: null,
  ladder: null,
  stepladder: null,
  fire_extinguisher: null,
  first_aid: null,
  gloves: "hand_near",
  goggles: "head",
  knife: "hand_near",
  hot_pot: null,
  cart: null,
  forklift: null,
  spill: null,
  bucket: null,
  mop: "hand_near",
  chemical: null,
  gas_cylinder: null,
  hammer: "hand_near",
  wrench: "hand_near",
  grinder: "hand_near",
  gear: null,
  sun: null,
  water_bottle: "hand_near",
  faucet: null,
  radio: "hand_near",
  spark: null,
  bubble_say: "head",
  bubble_alert: "head",
  elapsed_1min: null,
  elapsed_5min: null,
  elapsed_10min: null,
  elapsed_30min: null,
  elapsed_1h: null,
  aed: null,
  cubicle: null,
  wristband: "hand_near",
  work_platform: null,
  rolling_scaffold: null,
  safety_shoes: "foot_near",
  cut_gloves: "hand_near",
  insulated_gloves: "hand_near",
  voltage_detector: "hand_near",
  cooling_vest: null,
  step_stool: null,
  armband: null,
  crane: null,
  insulated_boots: "foot_near",
  dust_mask: "head",
  power_drill: "hand_near",
  aerial_platform: null,
  bulb_flicker: "hand_near",
  bulb_steady: "hand_near",
  danger_zone: null,
  partition: null,
  wire_broken: null,
  height_2m: null,
  fever: null,
  chair: "hip",
  bulb_off: "hand_near",
  label_teiatsu: null,
  distance_3m: null,
  label_anzen: null,
  safety_cross: null,
  count_3sec: null,
  healthy: null,
};

/**
 * 人を乗せる台の上の面の高さ（台の size に対する割合。11/6）。台を床（y 0.88）に置き、人の lift を size × この値にすると、人の足が上の面に乗る。
 * 例: 作業台を size 0.4 で置くと、lift は 0.4 × 0.59 = 0.236
 */
export const STAND_TOP: Partial<Record<PropKind, number>> = { work_platform: 0.59, rolling_scaffold: 0.695, aerial_platform: 0.78, step_stool: 0.48 };

/**
 * 椅子の座面の上の面の高さ（椅子の size に対する割合。11/6）。座る人（sit）のお尻の下は、床から背の高さ × 0.2。
 * キャンバスに置くときは、size を人の背の高さ × 0.44、at を { x: 人の x − 背の高さ × 0.03, y: 0.88 } にすると、座面がお尻に合う。
 * キャンバスに置いた椅子はいつも右向き（背もたれが左）なので、左を向いて座る人には腰に付ける。
 * 人の腰（hip）に付けると、大きさと横の位置は座面がお尻に合うように決まり、size は使わない（こちらが手軽）
 */
export const SEAT_TOP: Partial<Record<PropKind, number>> = { chair: 0.46 };

/** 床の線の高さ（scene.ts の GROUND と同じ。人の腰に付けた椅子の脚が床まで届く） */
const FLOOR_Y = 0.88;

/** c が部品の下の真ん中（床に置く）の部品。吹き出しの中では真ん中へずらして描く */
const ON_FLOOR = new Set<PropKind>([
  "toolbox", "trash_bin", "cone", "barrier", "ladder", "stepladder", "fire_extinguisher", "hot_pot", "cart", "forklift", "bucket", "chemical", "gas_cylinder",
  "cubicle", "work_platform", "rolling_scaffold", "safety_shoes", "step_stool", "crane", "insulated_boots", "aerial_platform",
  "partition", "height_2m", "chair",
]);

/** クレーンのブームの先（ワイヤーの出る所）。c は車体の下の真ん中、d は向き。吊り荷を先の真下に置くとワイヤーがつながる */
export const craneTip = ([cx, cy]: Pt, s: number, d: number): Pt => [cx + d * s * 0.6, cy - s * 1.05];

/** 天井の線の高さ（scene.ts の CEILING と同じ。吊り元の綱が天井まで届く） */
const CEIL = 0.06;

const INK = "#000";
/**
 * 塗りの灰色の 7 段（明るい順）。白（#fff）は絵柄の検査（style.ts）で新人のヘルメット・背景・吹き出しの中だけなので、
 * 小物のいちばん明るい面は紙の白（#f4f4f4）にする
 */
const PAPER = "#f4f4f4";
const LIGHT = "#ccc";
const MID = "#999";
const STEEL = "#777";
const DARK = "#555";
const DEEP = "#333";
const COAL = "#222";
const RED = "#d42a1e";

/** 縁の太さ（キャンバスの幅に対する割合）。人の縁（背の高さ 434 の中で 5〜6）を、背の高さ 0.55 の人に当てた値 */
const LINE = 0.0068;
export const lineWidth = (size: number) => Math.max(1.5, size * LINE);

const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};

export function validateProps(props: PropSpec[], figures: number): string[] {
  const errs: string[] = [];
  props.forEach((p, i) => {
    if (!(PROP_KINDS as readonly string[]).includes(p.kind)) errs.push(`props[${i}].kind: ${p.kind}`);
    if (!(p.size >= 0.04 && p.size <= 0.5)) errs.push(`props[${i}].size が範囲の外: ${p.size}`);
    if (p.inner !== undefined && !(BUBBLES.has(p.kind) && (INNER_KINDS as readonly string[]).includes(p.inner))) errs.push(`props[${i}].inner は吹き出しの中の道具だけ: ${p.inner}`);
    if (p.inner2 !== undefined && !(BUBBLES.has(p.kind) && p.inner !== undefined && (INNER_KINDS as readonly string[]).includes(p.inner2))) errs.push(`props[${i}].inner2 は inner のある吹き出しの 2 つ目の道具だけ: ${p.inner2}`);
    if (p.inner_marks !== undefined && !(Array.isArray(p.inner_marks) && p.inner_marks.length === 2 && p.inner_marks.every((m) => (INNER_MARKS as readonly string[]).includes(m)) && p.inner2 !== undefined))
      errs.push(`props[${i}].inner_marks は inner2 のある吹き出しに、印 2 つ（${INNER_MARKS.join("・")}）`);
    // チェック表の欄（11/6）
    const list = p.rows !== undefined || p.checks !== undefined || p.numbered !== undefined || p.icons !== undefined;
    if (list && p.kind !== "checklist") errs.push(`props[${i}] の rows・checks・numbered・icons はチェック表（checklist）だけ`);
    const rows = p.rows ?? 3;
    if (p.rows !== undefined && !(Number.isInteger(p.rows) && p.rows >= CHECKLIST_ROWS_MIN && p.rows <= CHECKLIST_ROWS_MAX)) errs.push(`props[${i}].rows は ${CHECKLIST_ROWS_MIN}〜${CHECKLIST_ROWS_MAX} の整数: ${p.rows}`);
    if (p.checks !== undefined && !(Number.isInteger(p.checks) && p.checks >= 0 && p.checks <= rows)) errs.push(`props[${i}].checks は 0〜行の数（${rows}）の整数: ${p.checks}`);
    if (p.numbered !== undefined && typeof p.numbered !== "boolean") errs.push(`props[${i}].numbered は true か false`);
    if (p.icons !== undefined && !(Array.isArray(p.icons) && p.icons.length <= rows && p.icons.every((k) => k === "fall" || k === "none" || (INNER_KINDS as readonly string[]).includes(k))))
      errs.push(`props[${i}].icons は行の数（${rows}）までの、fall・none・吹き出しの中の道具の並び`);
    if ("figure" in p.at) {
      if (p.at.figure < 0 || p.at.figure >= figures) errs.push(`props[${i}].at.figure が人物の番号の外`);
      if (Math.abs(p.at.dx ?? 0) > 1 || Math.abs(p.at.dy ?? 0) > 1) errs.push(`props[${i}].at のずれが範囲の外`);
    } else if (!(p.at.x >= 0 && p.at.x <= 1 && p.at.y >= 0 && p.at.y <= 1)) errs.push(`props[${i}].at が範囲の外`);
  });
  return errs;
}

/** 置き場所の点（px）と、付けた人の向き */
export function anchorPoint(at: PropAnchor, posed: Posed[], size: number): { c: Pt; d: 1 | -1 } {
  if ("figure" in at) {
    const p = posed[at.figure];
    const j = p.joints[at.joint];
    return { c: [j[0] + p.d * (at.dx ?? 0) * p.h, j[1] + (at.dy ?? 0) * p.h], d: p.d };
  }
  return { c: [at.x * size, at.y * size], d: 1 };
}

/** 描き方の付け足し。W は縁の太さ、icon は吹き出しの中の小さい絵、worn は人の頭や手に着けたとき */
interface Opt {
  W: number;
  icon?: boolean;
  worn?: boolean;
  /** 人の体に付けた（安全帯は腰のベルトだけにして、肩とももは harnessStraps が描く） */
  body?: boolean;
  /** 手に着けたとき、ひじの位置（袖口・リストバンドの向き） */
  elbow?: Pt;
  /** 吊り荷のワイヤーの上の端（クレーンの先につなぐとき） */
  topY?: number;
  /** クレーンに吊り荷がつながっている（クレーンは自分のワイヤーとフックを描かない） */
  linked?: boolean;
  /** チェック表の欄（11/6）。無ければ前の 3 行の絵 */
  list?: Pick<PropSpec, "rows" | "checks" | "numbered" | "icons">;
}

/** 高さの札の文字（線で描く。たった時間の札と同じく、数字と単位だけ） */
export const HEIGHT_LABEL: Partial<Record<PropKind, string>> = { height_2m: "2m" };

/** 部品の形。c は部品の「持つところ」（手に付けるときは手の位置。床に置く部品は下の真ん中） */
function shape(kind: PropKind, [cx, cy]: Pt, s: number, d: number, { W, icon = false, worn = false, body = false, elbow, topY, linked = false, list }: Opt): string {
  const h = s / 2;
  /** 向いている側を正にした横の位置 */
  const X = (v: number) => cx + d * v;
  const sw = (k = 1) => `stroke="${INK}" stroke-width="${n(W * k)}" stroke-linejoin="round"`;
  const line = (x1: number, y1: number, x2: number, y2: number, c = INK, k = 1) =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c}" stroke-width="${n(W * k)}" stroke-linecap="round"/>`;
  /** 縁つきの形（塗りと縁を 1 つの要素で。縁は塗りの上に乗る） */
  const path = (dd: string, fill: string, k = 1) => `<path d="${dd}" fill="${fill}" ${sw(k)}/>`;
  /** 角の丸い四角のパス。x1・x2 は向きで入れ替わってよい */
  const rr = (x1: number, y1: number, x2: number, y2: number, r?: number) => {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    const [t, u] = y1 < y2 ? [y1, y2] : [y2, y1];
    const q = Math.min(r ?? Math.min(b - a, u - t) * 0.22, (b - a) / 2, (u - t) / 2);
    return `M${n(a + q)} ${n(t)}H${n(b - q)}A${n(q)} ${n(q)} 0 0 1 ${n(b)} ${n(t + q)}V${n(u - q)}A${n(q)} ${n(q)} 0 0 1 ${n(b - q)} ${n(u)}H${n(a + q)}A${n(q)} ${n(q)} 0 0 1 ${n(a)} ${n(u - q)}V${n(t + q)}A${n(q)} ${n(q)} 0 0 1 ${n(a + q)} ${n(t)}Z`;
  };
  const box = (x1: number, y1: number, x2: number, y2: number, fill: string, r?: number, k = 1) => path(rr(x1, y1, x2, y2, r), fill, k);
  const circ = (x: number, y: number, r: number) => `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)}Z`;
  const ring = (x: number, y: number, r: number, fill: string, k = 1) => path(circ(x, y, r), fill, k);
  const dot = (x: number, y: number, r: number, fill = INK) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"/>`;
  const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
  /** 綱・柄・管のような太さのある線。縁の黒の線の上に中身の線を重ねる（手足と同じ 2 回描き） */
  const cord = (dd: string, t: number, fill: string) =>
    `<path d="${dd}" fill="none" stroke="${INK}" stroke-width="${n(t)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${dd}" fill="none" stroke="${fill}" stroke-width="${n(Math.max(0.5, t - W * 1.6))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  /** 重なった形をひと続きに見せる: 全部の縁（太さ 2 倍。外へ出た半分が縁になる）→ 全部の中身 */
  const merge = (parts: [string, string][], rule = "") =>
    parts.map(([dd]) => `<path d="${dd}" fill="${INK}"${rule} stroke="${INK}" stroke-width="${n(W * 2)}" stroke-linejoin="round"/>`).join("") +
    parts.map(([dd, fill]) => `<path d="${dd}" fill="${fill}"${rule}/>`).join("");
  /** つや: 濃い面に、光の来る側（左上）へ短い明るい線を 1 本 */
  const shine = (x1: number, y1: number, x2: number, y2: number, on: string) => line(x1, y1, x2, y2, on === MID || on === STEEL ? LIGHT : on === LIGHT ? PAPER : MID, 0.7);
  /** 印の太さ（大きさに合わせる） */
  const mark = s * 0.1;

  // かぶり物: 頭の上の半分をおおう丸い形と、縁の帯（向いている側へ少し長い）。目と口は出したまま。人の絵柄の安全帽と同じ作り
  const dome = (fill: string, brim: number, cap = false) => {
    const r = h * 0.9;
    const base = cy - h * 0.28;
    const top = path(`M${n(cx - r)} ${n(base)}C${n(cx - r)} ${n(base - r * 1.25)} ${n(cx + r)} ${n(base - r * 1.25)} ${n(cx + r)} ${n(base)}Z`, fill);
    const bh = r * 0.2;
    const band = cap
      ? box(X(r * 0.45), base - bh * 0.6, X(r * (1 + brim)), base + bh * 0.4, fill, bh * 0.5)
      : box(X(-r * 1.06), base - bh * 0.6, X(r * (1.06 + brim)), base + bh * 0.4, fill, bh * 0.5);
    const ridge = cap ? "" : `<path d="M${n(X(r * 0.12))} ${n(base - r * 0.92)}Q${n(X(r * 0.24))} ${n(base - r * 0.5)} ${n(X(r * 0.2))} ${n(base - bh * 0.6)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.7)}" stroke-linecap="round"/>`;
    const gloss = fill === "#fff" ? "" : `<path d="M${n(X(-r * 0.62))} ${n(base - r * 0.42)}Q${n(X(-r * 0.5))} ${n(base - r * 0.78)} ${n(X(-r * 0.16))} ${n(base - r * 0.88)}" fill="none" stroke="${fill === COAL ? STEEL : LIGHT}" stroke-width="${n(W * 0.7)}" stroke-linecap="round"/>`;
    return top + ridge + gloss + band;
  };
  // 表示の丸 2 つ（左は抜き、右は塗り）を入れた暗い窓。盤と検電器の印
  const display = (x1: number, y1: number, x2: number, y2: number) => {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    const hh = y2 - y1;
    const ym = (y1 + y2) / 2;
    return box(a, y1, b, y2, DEEP, hh * 0.3, 0.6) +
      `<circle cx="${n(a + (b - a) * 0.3)}" cy="${n(ym)}" r="${n(hh * 0.24)}" fill="none" stroke="${PAPER}" stroke-width="${n(Math.max(1, hh * 0.1))}"/>` + dot(a + (b - a) * 0.7, ym, hh * 0.26, PAPER);
  };
  switch (kind) {
    case "helmet":
      // ほかの作業の人のグレーのヘルメット
      return dome(MID, 0.25);
    case "helmet_new":
      // 新人の白いヘルメット（白は data-part="helmet-new" の中だけ）
      return `<g data-part="helmet-new">${dome("#fff", 0.25)}</g>`;
    case "cap_lead":
      // 上の人の黒い帽子: 丸い形と、前へ長く出るつば
      return dome(COAL, 0.75, true);
    case "harness": {
      if (!body) {
        // 安全帯（フルハーネス・正面。11/5 写真に合わせて描き直し）: 背中の D の環から出る綱と先のフック、肩から腰へ下りる 2 本のベルトと
        // 肩の上のつなぎ、胸の横のベルトと留め具、腰のベルトと前の留め具、ももを回る 2 つの輪。人に付けたときは腰のベルトだけ（下）
        const t = W * 2.6;
        const loop = (x: number, y: number, rx: number, ry: number) => `M${n(x - rx)} ${n(y)}A${n(rx)} ${n(ry)} 0 1 0 ${n(x + rx)} ${n(y)}A${n(rx)} ${n(ry)} 0 1 0 ${n(x - rx)} ${n(y)}Z`;
        const hx = X(h * 1.0);
        const hy = cy + h * 0.2;
        return cord(`M${n(cx)} ${n(cy - h * 1.36)}Q${n(X(h * 1.2))} ${n(cy - h * 1.3)} ${n(hx)} ${n(hy - h * 0.26)}`, W * 2.2, MID) +
          cord(rr(hx - h * 0.13, hy - h * 0.25, hx + h * 0.13, hy + h * 0.28, h * 0.13), W * 2.4, LIGHT) +
          [-1, 1].map((k) => cord(loop(cx + k * h * 0.3, cy + h * 0.5, h * 0.22, h * 0.3), t, DEEP)).join("") +
          cord(`M${n(cx - h * 0.22)} ${n(cy)}L${n(cx - h * 0.32)} ${n(cy - h * 1.22)}Q${n(cx)} ${n(cy - h * 1.46)} ${n(cx + h * 0.32)} ${n(cy - h * 1.22)}L${n(cx + h * 0.22)} ${n(cy)}`, t, DEEP) +
          cord(`M${n(cx - h * 0.4)} ${n(cy - h * 0.72)}H${n(cx + h * 0.4)}`, t, DEEP) +
          ring(cx, cy - h * 1.36, h * 0.09, MID, 0.8) +
          box(cx - h * 0.62, cy - h * 0.13, cx + h * 0.62, cy + h * 0.13, DEEP, h * 0.06) +
          box(cx - h * 0.1, cy - h * 0.82, cx + h * 0.1, cy - h * 0.62, LIGHT, h * 0.04, 0.8) + box(cx - h * 0.12, cy - h * 0.2, cx + h * 0.12, cy + h * 0.2, LIGHT, h * 0.05, 0.8);
      }
      // 安全帯（人の腰）: 腰のベルトと前のバックル、背中側から出る綱と、先のフック（縦長の輪）
      const bk = X(-h * 0.7);
      const hx = X(-h * 1.3);
      const hy = cy - h * 1.05;
      return cord(`M${n(bk)} ${n(cy)}Q${n(X(-h * 1.45))} ${n(cy - h * 0.1)} ${n(hx)} ${n(hy + h * 0.28)}`, W * 2.6, MID) +
        cord(rr(hx - h * 0.13, hy - h * 0.25, hx + h * 0.13, hy + h * 0.28, h * 0.13), W * 2.4, LIGHT) +
        box(cx - h * 0.78, cy - h * 0.15, cx + h * 0.78, cy + h * 0.15, DEEP, h * 0.08) +
        box(X(h * 0.12), cy - h * 0.22, X(h * 0.42), cy + h * 0.22, LIGHT, h * 0.06, 0.8);
    }
    case "tester": {
      // 検電器: 手に持つ丸い軸と表示の丸 2 つの窓、向いている側へのびる先と黒い先端
      const back = X(-h * 0.55);
      const front = X(h * 0.95);
      const tip = X(h * 1.6);
      return cord(`M${n(front)} ${n(cy)}H${n(tip)}`, W * 2.6, MID) + dot(tip, cy, W * 1.3) +
        box(back, cy - h * 0.3, front, cy + h * 0.3, LIGHT, h * 0.3) + display(X(h * 0.02), cy - h * 0.17, X(h * 0.78), cy + h * 0.17) +
        line(X(-h * 0.25), cy - h * 0.26, X(-h * 0.25), cy + h * 0.26, INK, 0.6);
    }
    case "wire": {
      // 電線: 手から向いている側へ垂れる灰の被覆と、先の 2 本の芯
      const ex = X(s);
      const ey = cy + h * 0.4;
      return cord(`M${n(X(h * 1.75))} ${n(ey - h * 0.12)}L${n(ex + d * h * 0.3)} ${n(ey - h * 0.28)}M${n(X(h * 1.75))} ${n(ey + h * 0.12)}L${n(ex + d * h * 0.3)} ${n(ey + h * 0.28)}`, W * 2, LIGHT) +
        cord(`M${n(cx)} ${n(cy)}C${n(X(h * 0.6))} ${n(cy + h * 0.9)} ${n(X(h * 1.2))} ${n(cy - h * 0.5)} ${n(X(h * 1.8))} ${n(ey)}`, W * 3.2, DARK);
    }
    case "panel": {
      // 盤: 壁に付いた角の丸い箱。扉の内の線、表示の窓（丸 2 つ）、ブレーカーの列、下へ垂れるコードと差し込み。c は箱の真ん中
      const pw = s * 0.95;
      const ph = s * 0.78;
      const x0 = cx - pw / 2;
      const y0 = cy - ph / 2;
      let out = box(x0, y0, x0 + pw, y0 + ph, LIGHT, s * 0.1) + display(x0 + pw * 0.16, y0 + ph * 0.16, x0 + pw * 0.84, y0 + ph * 0.46);
      if (!icon) {
        out += `<path d="${rr(x0 + pw * 0.07, y0 + ph * 0.07, x0 + pw * 0.93, y0 + ph * 0.93, s * 0.06)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.5)}"/>`;
        for (let k = 0; k < 4; k++) {
          const bx = x0 + pw * (0.2 + k * 0.17);
          out += box(bx, y0 + ph * 0.58, bx + pw * 0.1, y0 + ph * 0.84, PAPER, pw * 0.02, 0.6) + line(bx + pw * 0.05, y0 + ph * 0.64, bx + pw * 0.05, y0 + ph * 0.7, INK, 0.9);
        }
        const ty = y0 + ph + s * 0.3;
        out += cord(`M${n(cx)} ${n(y0 + ph)}C${n(cx)} ${n(ty - s * 0.1)} ${n(cx - s * 0.12)} ${n(ty - s * 0.12)} ${n(cx - s * 0.08)} ${n(ty)}`, W * 2, DARK) +
          box(cx - s * 0.14, ty, cx - s * 0.02, ty + s * 0.1, DEEP, s * 0.02, 0.8);
      }
      return out;
    }
    case "outlet": {
      // コンセント: 角の丸い板に、差し込み口 2 つ。どの口にも縦の穴が 2 つずつ。c は板の真ん中
      const pw = s * 0.62;
      const x0 = cx - pw / 2;
      const y0 = cy - h;
      let out = box(x0, y0, x0 + pw, y0 + s, PAPER, s * 0.12);
      for (const k of [0, 1]) {
        const oy = y0 + s * (0.1 + k * 0.45);
        out += box(x0 + pw * 0.14, oy, x0 + pw * 0.86, oy + s * 0.36, LIGHT, s * 0.1, 0.8);
        for (const side of [-1, 1]) out += `<rect x="${n(cx + side * pw * 0.17 - s * 0.03)}" y="${n(oy + s * 0.09)}" width="${n(s * 0.06)}" height="${n(s * 0.18)}" rx="${n(s * 0.02)}" fill="${INK}"/>`;
      }
      return out;
    }
    case "toolbox": {
      // 道具箱: 床に置いた濃い箱、ふたの線と留め金、上の取っ手。c は箱の下の真ん中
      const bh = s * 0.45;
      return cord(`M${n(cx - s * 0.22)} ${n(cy - bh)}V${n(cy - bh - s * 0.14)}H${n(cx + s * 0.22)}V${n(cy - bh)}`, W * 2.6, MID) +
        box(cx - h, cy - bh, cx + h, cy, DARK, s * 0.07) + line(cx - h + W, cy - bh * 0.62, cx + h - W, cy - bh * 0.62, INK, 0.7) +
        box(cx - s * 0.06, cy - bh * 0.72, cx + s * 0.06, cy - bh * 0.46, LIGHT, s * 0.02, 0.6) + shine(cx - h * 0.8, cy - bh * 0.82, cx - h * 0.45, cy - bh * 0.82, DARK);
    }
    case "check_mark":
      // ✓ の丸: 黒い丸に明るい ✓（確かめた、の印）
      return dot(cx, cy, h * 0.9) +
        `<polyline points="${n(cx - h * 0.42)},${n(cy + h * 0.02)} ${n(cx - h * 0.1)},${n(cy + h * 0.34)} ${n(cx + h * 0.45)},${n(cy - h * 0.32)}" fill="none" stroke="${PAPER}" stroke-width="${n(mark * 1.2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "bubble_question":
    case "bubble_check":
    case "think_question":
    case "think_check":
    case "bubble_say":
    case "bubble_alert":
      return ""; // 吹き出しは bubbleSvg で描く
    case "spark": {
      // 火花（11/5）: 真ん中の稲妻の形と、まわりへ飛ぶ短い線 8 本と小さい粒。c は真ん中
      const bolt = poly([[cx - h * 0.12, cy - h * 0.62], [cx + h * 0.3, cy - h * 0.62], [cx + h * 0.06, cy - h * 0.1], [cx + h * 0.34, cy - h * 0.1], [cx - h * 0.2, cy + h * 0.66], [cx - h * 0.02, cy + h * 0.08], [cx - h * 0.3, cy + h * 0.08]]);
      let out = "";
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        out += line(cx + Math.cos(a) * h * 0.62, cy + Math.sin(a) * h * 0.62, cx + Math.cos(a) * h * 0.95, cy + Math.sin(a) * h * 0.95, INK, 1.1);
      }
      for (const a of [0.3, 1.9, 3.5, 5.1]) out += dot(cx + Math.cos(a) * h * 1.05, cy + Math.sin(a) * h * 1.05, W * 0.9);
      return out + path(bolt, LIGHT, 1.1);
    }
    case "elapsed_1min":
    case "elapsed_5min":
    case "elapsed_10min":
    case "elapsed_30min":
    case "elapsed_1h": {
      // たった時間の札（11/5）: 薄い札に、左に小さい時計、右に「10min」などを線で描く。c は札の真ん中
      const label = ELAPSED[kind]!;
      const gh = h * 0.5;
      const gw = gh * 0.55;
      const tw = glyphsWidth(label, gw);
      const cr = gh * 0.62;
      const pad = h * 0.18;
      const bw = cr * 2 + pad * 3 + tw;
      const x0 = cx - bw / 2;
      const ccx = x0 + pad + cr;
      return box(x0, cy - h * 0.55, x0 + bw, cy + h * 0.55, PAPER, h * 0.2) +
        ring(ccx, cy, cr, LIGHT, 1) + line(ccx, cy, ccx, cy - cr * 0.6, INK, 0.9) + line(ccx, cy, ccx + cr * 0.45, cy, INK, 1.1) +
        glyphs(label, ccx + cr + pad, cy - gh * 0.8, gw, gh, W * 1.15);
    }
    case "suspended_load": {
      // 上の端から吊った荷: ワイヤー、フック、2 本の吊り具、板を組んだ荷
      const top = topY ?? Math.max(0, cy - h * 2.2);
      const hy = cy - h * 0.78;
      return line(cx, top, cx, hy - h * 0.18, INK, 1.2) +
        `<path d="M${n(cx)} ${n(hy - h * 0.2)}V${n(hy)}A${n(h * 0.12)} ${n(h * 0.12)} 0 1 1 ${n(cx - h * 0.2)} ${n(hy - h * 0.04)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.6)}" stroke-linecap="round"/>` +
        line(cx - h * 0.62, cy - h * 0.15, cx, hy + h * 0.1, INK, 1) + line(cx + h * 0.62, cy - h * 0.15, cx, hy + h * 0.1, INK, 1) +
        box(cx - h, cy - h * 0.15, cx + h, cy + h, DARK, s * 0.05) + line(cx - h + W, cy + h * 0.28, cx + h - W, cy + h * 0.28, INK, 0.6) +
        line(cx - h + W, cy + h * 0.62, cx + h - W, cy + h * 0.62, INK, 0.6) + shine(cx - h * 0.78, cy + h * 0.06, cx - h * 0.4, cy + h * 0.06, DARK);
    }
    case "arrow_down":
      // 下向きの矢印: 軸と矢じりを 1 つの形で（印なので太さは大きさに合わせる）
      return path(poly([[cx - h * 0.17, cy - h], [cx + h * 0.17, cy - h], [cx + h * 0.17, cy + h * 0.08], [cx + h * 0.52, cy + h * 0.08], [cx, cy + h], [cx - h * 0.52, cy + h * 0.08], [cx - h * 0.17, cy + h * 0.08]]), INK);
    case "broom": {
      // 箒: 柄の上を手に持ち、穂先は向いている側の下へ。穂先は台形と穂の線
      const bx = X(h * 0.5);
      const by = cy + h * 1.6;
      let out = cord(`M${n(X(-h * 0.06))} ${n(cy - h * 0.35)}L${n(bx)} ${n(by)}`, W * 2.6, MID) +
        path(poly([[bx - h * 0.42, by], [bx + h * 0.42, by], [bx + h * 0.6, by + h * 0.5], [bx - h * 0.6, by + h * 0.5]]), STEEL);
      for (const k of [-0.3, 0, 0.3]) out += line(bx + k * h * 1.05, by + h * 0.12, bx + k * h * 1.3, by + h * 0.44, INK, 0.5);
      return out + box(bx - h * 0.46, by - h * 0.1, bx + h * 0.46, by + h * 0.08, DEEP, h * 0.04, 0.8);
    }
    case "box": {
      // 両手で前に抱える段ボールの箱。手の位置を箱の手前の上の角あたりにする。上のふたの線と、まん中のテープ
      const x0 = cx - (d > 0 ? h * 0.3 : h * 1.7);
      const y0 = cy - h * 0.55;
      return box(x0, y0, x0 + s, y0 + h * 1.1, LIGHT, s * 0.05) + box(x0 + s * 0.44, y0, x0 + s * 0.56, y0 + h * 0.42, MID, 0, 0.6) +
        line(x0 + W, y0 + h * 0.42, x0 + s - W, y0 + h * 0.42, INK, 0.6);
    }
    case "lock": {
      // 錠前: 金属の掛け金の弧、濃い本体、鍵穴（丸と下へ広がる形）
      const sx = h * 0.36;
      return cord(`M${n(cx - sx)} ${n(cy - h * 0.1)}V${n(cy - h * 0.45)}A${n(sx)} ${n(sx)} 0 0 1 ${n(cx + sx)} ${n(cy - h * 0.45)}V${n(cy - h * 0.1)}`, W * 2.8, MID) +
        box(cx - h * 0.62, cy - h * 0.15, cx + h * 0.62, cy + h * 0.85, DARK, h * 0.16) +
        path(`M${n(cx - h * 0.12)} ${n(cy + h * 0.25)}A${n(h * 0.14)} ${n(h * 0.14)} 0 1 1 ${n(cx + h * 0.12)} ${n(cy + h * 0.25)}L${n(cx + h * 0.08)} ${n(cy + h * 0.55)}H${n(cx - h * 0.08)}Z`, PAPER, 0.5) +
        shine(cx - h * 0.46, cy + h * 0.02, cx - h * 0.46, cy + h * 0.34, DARK);
    }
    case "tag":
      // 札: ひもで下げた角の丸い板と、ひもを通す穴。中は × の印（触るな）を図形で描く
      return line(cx, cy - h * 0.9, cx, cy - h * 0.38, INK, 0.8) + box(cx - h * 0.7, cy - h * 0.45, cx + h * 0.7, cy + h * 0.8, PAPER, s * 0.08) +
        ring(cx, cy - h * 0.28, h * 0.07, LIGHT, 0.6) +
        line(cx - h * 0.32, cy - h * 0.02, cx + h * 0.32, cy + h * 0.56, INK, (mark * 0.8) / W) + line(cx + h * 0.32, cy - h * 0.02, cx - h * 0.32, cy + h * 0.56, INK, (mark * 0.8) / W);
    case "clock":
      // 時計: 太い縁と 12 の目盛り（12 時・3 時・6 時・9 時は長く太い）。針は描かない「時計の記号」（11/6 作者）。
      // 理由: 針を決め打ちで描くと、どのカードでも同じ時刻（前は 3 時）に読まれ、9 時・12 時・17 時が伝わらなかった。10 時 10 分の形も時刻に読まれる。
      // 時刻はカードの文で伝える。針を時刻に向けるのは、小物に時刻の欄を足してから（docs/decisions.md）
      return ring(cx, cy, h - W, PAPER, 1.6) +
        Array.from({ length: 12 }, (_, k) => {
          const a = (k * Math.PI) / 6, main = k % 3 === 0;
          const r0 = h * (main ? 0.5 : 0.62);
          return line(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0, cx + Math.sin(a) * h * 0.74, cy - Math.cos(a) * h * 0.74, INK, main ? 1 : 0.6);
        }).join("");
    case "checklist": {
      if (list) return checklistRows([cx, cy], s, W, list);
      // 手元のチェックリスト: 濃い板に紙と上の留め具、3 行の欄。上の 2 行に ✓、下の 1 行は空の四角
      const x0 = cx - h * 0.72;
      const y0 = cy - h;
      let out = box(x0, y0, x0 + h * 1.44, y0 + s, STEEL, s * 0.06) + box(x0 + h * 0.12, y0 + h * 0.16, x0 + h * 1.32, y0 + s - h * 0.1, PAPER, s * 0.02, 0.6) +
        box(cx - h * 0.3, y0 - h * 0.12, cx + h * 0.3, y0 + h * 0.14, DEEP, s * 0.03, 0.8);
      for (let k = 0; k < 3; k++) {
        const ry = y0 + h * (0.55 + k * 0.48);
        const bx = x0 + h * 0.26;
        out += box(bx, ry - h * 0.13, bx + h * 0.26, ry + h * 0.13, PAPER, s * 0.02, 0.5) + line(bx + h * 0.42, ry, x0 + h * 1.16, ry, MID, 0.7);
        if (k < 2) out += `<polyline points="${n(bx + h * 0.04)},${n(ry)} ${n(bx + h * 0.12)},${n(ry + h * 0.1)} ${n(bx + h * 0.32)},${n(ry - h * 0.2)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.9)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return out;
    }
    case "prohibit": {
      // 禁止: 赤い円と左上から右下への斜線。下のものが透けるよう中は塗らない。赤はこの部品の中だけ（014）
      const r = h - mark * 0.6;
      return `<g data-part="prohibit"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${RED}" stroke-width="${n(mark * 1.2)}"/>` +
        `<line x1="${n(cx - r * 0.7)}" y1="${n(cy - r * 0.7)}" x2="${n(cx + r * 0.7)}" y2="${n(cy + r * 0.7)}" stroke="${RED}" stroke-width="${n(mark * 1.2)}"/></g>`;
    }
    case "circle_mark":
      // ○: 正しいやり方の印。太い黒の輪
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h * 0.8)}" fill="none" stroke="${INK}" stroke-width="${n(mark * 1.5)}"/>`;
    case "cross_mark":
      // ×: まちがったやり方の印。太い黒の 2 本線（赤は禁止の部品だけに使う）
      return line(cx - h * 0.7, cy - h * 0.7, cx + h * 0.7, cy + h * 0.7, INK, (mark * 1.5) / W) + line(cx + h * 0.7, cy - h * 0.7, cx - h * 0.7, cy + h * 0.7, INK, (mark * 1.5) / W);
    case "unwell": {
      // 体の具合が悪い印: 頭の前の上のうず巻きと、頭の後ろの汗の粒 3 つ。c は頭
      const sx = X(h * 0.75);
      const sy = cy - h * 1.05;
      const pts: string[] = [];
      for (let k = 0; k <= 60; k++) {
        const a = (k / 60) * Math.PI * 5;
        const r = (k / 60) * h * 0.5;
        pts.push(`${n(sx + Math.cos(a) * r)},${n(sy + Math.sin(a) * r)}`);
      }
      const drop = (x: number, y: number, r: number) =>
        path(`M${n(x)} ${n(y - r * 1.8)}Q${n(x + r * 1.1)} ${n(y - r * 0.2)} ${n(x)} ${n(y + r)}Q${n(x - r * 1.1)} ${n(y - r * 0.2)} ${n(x)} ${n(y - r * 1.8)}Z`, LIGHT, 0.7);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${INK}" stroke-width="${n(W)}" stroke-linecap="round"/>` +
        drop(X(-h * 0.85), cy - h * 0.55, h * 0.13) + drop(X(-h * 1.05), cy - h * 0.1, h * 0.11) + drop(X(-h * 0.8), cy + h * 0.3, h * 0.1);
    }
    case "span_arrow":
      // 幅の矢印: 左右の両方へ向く矢じりと、端の縦の線。c は真ん中、長さは size
      return line(cx - h * 0.8, cy, cx + h * 0.8, cy, INK, 1.3) +
        path(poly([[cx - h, cy], [cx - h * 0.74, cy - h * 0.16], [cx - h * 0.74, cy + h * 0.16]]), INK, 0.6) +
        path(poly([[cx + h, cy], [cx + h * 0.74, cy - h * 0.16], [cx + h * 0.74, cy + h * 0.16]]), INK, 0.6) +
        line(cx - h, cy - h * 0.28, cx - h, cy + h * 0.28, INK, 1) + line(cx + h, cy - h * 0.28, cx + h, cy + h * 0.28, INK, 1);
    case "edge":
      // 床の端: c から右は床が無く、下へ暗い穴が続く（足を踏み外すと落ちる）。c は床の端の角
      return `<rect x="${n(cx)}" y="${n(cy - W * 0.5)}" width="${n(s * 20)}" height="${n(s * 20)}" fill="${DEEP}"/>` + line(cx, cy, cx, cy + s * 20, INK, 1.6) +
        line(cx - s * 0.4, cy, cx, cy, INK, 1.6);
    case "anchor_line":
      return ""; // 天井までの長さが要るので propsSvg で描く
    case "trash_bin": {
      // ごみ箱: 下の狭い台形の箱と、ふたとつまみと、縦の筋 2 本。c は箱の下の真ん中
      const bh = s * 0.88;
      const lid = s * 0.12;
      let out = path(`M${n(cx - h * 0.8)} ${n(cy - bh)}L${n(cx + h * 0.8)} ${n(cy - bh)}L${n(cx + h * 0.62)} ${n(cy)}L${n(cx - h * 0.62)} ${n(cy)}Z`, MID);
      for (const k of [-1, 1]) out += line(cx + k * h * 0.28, cy - bh * 0.8, cx + k * h * 0.22, cy - bh * 0.15, INK, 0.6);
      return out + shine(cx - h * 0.62, cy - bh * 0.8, cx - h * 0.55, cy - bh * 0.4, MID) +
        box(cx - h * 0.16, cy - bh - lid * 1.7, cx + h * 0.16, cy - bh - lid * 0.6, DARK, lid * 0.3, 0.8) + box(cx - h * 0.92, cy - bh - lid, cx + h * 0.92, cy - bh + lid * 0.1, DARK, lid * 0.35);
    }
    case "cone": {
      // カラーコーン: 濃い台、上の細い円すい、明るい帯 2 本。塗り → 帯 → 縁の順で、帯が縁の線を隠さない。c は下の真ん中
      const yb = cy - s * 0.1;
      const yt = cy - s * 0.95;
      const at = (f: number): [number, number] => [s * (0.06 + (0.31 - 0.06) * f), yt + (yb - yt) * f];
      const body = `M${n(cx - s * 0.31)} ${n(yb)}L${n(cx - s * 0.06)} ${n(yt + s * 0.03)}Q${n(cx)} ${n(yt - s * 0.02)} ${n(cx + s * 0.06)} ${n(yt + s * 0.03)}L${n(cx + s * 0.31)} ${n(yb)}Z`;
      const band = (f1: number, f2: number) => {
        const [a1, y1] = at(f1);
        const [a2, y2] = at(f2);
        return `<path d="${poly([[cx - a1, y1], [cx + a1, y1], [cx + a2, y2], [cx - a2, y2]])}" fill="${PAPER}"/>`;
      };
      return box(cx - s * 0.45, cy - s * 0.12, cx + s * 0.45, cy, DEEP, s * 0.03) +
        `<path d="${body}" fill="${STEEL}"/>` + band(0.26, 0.42) + band(0.6, 0.76) + `<path d="${body}" fill="none" ${sw()}/>`;
    }
    case "barrier": {
      // 立入禁止のバー: 横の板に斜めの縞 3 本、両はしの足と床の台。c は下の真ん中
      const y0 = cy - s * 0.78;
      const y1 = cy - s * 0.52;
      const legs = [-1, 1].map((k) => cord(`M${n(cx + k * s * 0.36)} ${n(y1)}L${n(cx + k * s * 0.42)} ${n(cy - s * 0.05)}`, W * 2.8, DARK) + box(cx + k * s * 0.42 - s * 0.09, cy - s * 0.06, cx + k * s * 0.42 + s * 0.09, cy, DEEP, s * 0.02, 0.8)).join("");
      const bd = rr(cx - h, y0, cx + h, y1, s * 0.04);
      const sk = (y1 - y0) * 0.7;
      const stripes = [-0.3, 0, 0.3].map((f) => {
        const x = cx + f * s;
        return `<path d="${poly([[x - s * 0.06 + sk / 2, y0 + W * 0.5], [x + s * 0.06 + sk / 2, y0 + W * 0.5], [x + s * 0.06 - sk / 2, y1 - W * 0.5], [x - s * 0.06 - sk / 2, y1 - W * 0.5]])}" fill="${DEEP}"/>`;
      }).join("");
      return legs + `<path d="${bd}" fill="${PAPER}"/>` + stripes + `<path d="${bd}" fill="none" ${sw()}/>`;
    }
    case "ladder": {
      // はしご: 2 本の柱と 5 段の踏みさん、足の台。踏みさんを先に描き、柱でその端を隠す。c は下の真ん中
      const top = cy - s;
      let out = "";
      for (let k = 1; k <= 5; k++) {
        const y = cy - (s * k) / 6;
        out += cord(`M${n(cx - s * 0.17)} ${n(y)}H${n(cx + s * 0.17)}`, W * 2.2, STEEL);
      }
      for (const k of [-1, 1]) out += cord(`M${n(cx + k * s * 0.17)} ${n(cy - W)}V${n(top)}`, W * 2.8, MID) + box(cx + k * s * 0.17 - s * 0.05, cy - s * 0.04, cx + k * s * 0.17 + s * 0.05, cy, DEEP, s * 0.015, 0.7);
      return out;
    }
    case "stepladder": {
      // 脚立（横から）: A の形の 2 本の足、前の足に 3 つの踏み台、間の開き止め、上の天板。c は下の真ん中
      const ay = cy - s * 0.92;
      const fx = X(s * 0.3);
      const bx = X(-s * 0.3);
      let out = line(X(-s * 0.16), cy - s * 0.4, X(s * 0.16), cy - s * 0.4, INK, 0.8) +
        cord(`M${n(cx)} ${n(ay)}L${n(bx)} ${n(cy - W)}`, W * 2.8, STEEL) + cord(`M${n(cx)} ${n(ay)}L${n(fx)} ${n(cy - W)}`, W * 2.8, MID);
      for (const f of [0.28, 0.52, 0.76]) {
        const px = cx + (fx - cx) * f;
        const py = ay + (cy - ay) * f;
        out += box(px - d * s * 0.15, py - s * 0.025, px + d * s * 0.03, py + s * 0.025, STEEL, s * 0.01, 0.7);
      }
      return out + box(X(-s * 0.1), ay - s * 0.06, X(s * 0.1), ay + s * 0.02, DARK, s * 0.02);
    }
    case "fire_extinguisher": {
      // 消火器: 濃い胴、明るい札、上の弁とレバー、前へ垂れるホースとノズル、胴のつや。c は下の真ん中
      const x1 = cx - s * 0.2;
      const x2 = cx + s * 0.2;
      const y0 = cy - s * 0.78;
      return box(cx - s * 0.06, y0 - s * 0.1, cx + s * 0.06, y0 + s * 0.02, DEEP, s * 0.02, 0.8) +
        line(X(-s * 0.02), y0 - s * 0.1, X(-s * 0.2), y0 - s * 0.16, INK, 1.6) +
        box(x1, y0, x2, cy, DARK, s * 0.16) + box(cx - s * 0.13, y0 + s * 0.22, cx + s * 0.13, y0 + s * 0.46, PAPER, s * 0.03, 0.7) +
        line(cx - s * 0.07, y0 + s * 0.34, cx + s * 0.07, y0 + s * 0.34, INK, 0.6) +
        shine(cx - s * 0.13, y0 + s * 0.08, cx - s * 0.13, y0 + s * 0.17, DARK) +
        cord(`M${n(X(s * 0.06))} ${n(y0 - s * 0.04)}C${n(X(s * 0.34))} ${n(y0)} ${n(X(s * 0.32))} ${n(cy - s * 0.34)} ${n(X(s * 0.26))} ${n(cy - s * 0.22)}`, W * 2.2, DEEP) +
        box(X(s * 0.2), cy - s * 0.24, X(s * 0.31), cy - s * 0.12, COAL, s * 0.02, 0.8);
    }
    case "first_aid": {
      // 救急箱: 明るい箱と上の取っ手、まん中の十字（赤は使えないので濃い灰）。c は箱の真ん中
      const y0 = cy - s * 0.32;
      const q = s * 0.08;
      return cord(`M${n(cx - s * 0.16)} ${n(y0)}V${n(y0 - s * 0.12)}H${n(cx + s * 0.16)}V${n(y0)}`, W * 2.4, DARK) +
        box(cx - h, y0, cx + h, cy + s * 0.36, PAPER, s * 0.08) + line(cx - h + W, y0 + s * 0.14, cx + h - W, y0 + s * 0.14, INK, 0.6) +
        path(poly([[cx - q, cy - q * 2.2], [cx + q, cy - q * 2.2], [cx + q, cy - q * 0.2], [cx + q * 3, cy - q * 0.2], [cx + q * 3, cy + q * 1.8], [cx + q, cy + q * 1.8], [cx + q, cy + q * 3.8], [cx - q, cy + q * 3.8], [cx - q, cy + q * 1.8], [cx - q * 3, cy + q * 1.8], [cx - q * 3, cy - q * 0.2], [cx - q, cy - q * 0.2]]), DEEP, 0.7);
    }
    case "gloves": {
      // 手袋: 着けたときは手の丸を覆う灰の丸と、向いている側の親指。持つ・置くときは指 4 本と親指と濃い袖口の形。c は手
      if (worn) return merge([[circ(cx, cy, s * 0.3), MID], [circ(X(s * 0.22), cy - s * 0.2, s * 0.13), MID]]);
      const fing = [-0.21, -0.07, 0.07, 0.21].map((f, i): [string, string] => [rr(cx + f * s - s * 0.065, cy - s * (0.48 - (i === 0 || i === 3 ? 0.06 : 0)), cx + f * s + s * 0.065, cy, s * 0.065), MID]);
      // 親指は手のひらの横から斜め上へのびる細い形（先は丸）
      const thumb = `M${n(X(s * 0.16))} ${n(cy + s * 0.18)}L${n(X(s * 0.38))} ${n(cy - s * 0.1)}A${n(s * 0.065)} ${n(s * 0.065)} 0 0 ${d > 0 ? 1 : 0} ${n(X(s * 0.47))} ${n(cy - s * 0.02)}L${n(X(s * 0.26))} ${n(cy + s * 0.22)}Z`;
      return merge([...fing, [rr(cx - s * 0.28, cy - s * 0.18, cx + s * 0.28, cy + s * 0.22, s * 0.12), MID], [thumb, MID]]) +
        box(cx - s * 0.26, cy + s * 0.2, cx + s * 0.26, cy + s * 0.42, DARK, s * 0.04);
    }
    case "goggles": {
      // 保護めがね: 着けたときは目の前の明るいレンズと、頭の後ろへ回るバンド（横から）。持つ・置くときは正面の 2 つのレンズ。レンズにつや
      if (worn) {
        const r = s / 2.5; // かぶり物と同じく、s は頭の半径の 2.5 倍
        const lx = X(r * 0.52);
        const ly = cy + r * 0.1;
        return cord(`M${n(X(r * 0.2))} ${n(ly - r * 0.05)}Q${n(X(-r * 0.5))} ${n(ly - r * 0.25)} ${n(X(-r * 0.98))} ${n(ly - r * 0.15)}`, W * 2.4, DARK) +
          box(lx - r * 0.34, ly - r * 0.24, lx + r * 0.34, ly + r * 0.22, LIGHT, r * 0.14) + shine(lx - r * 0.14, ly - r * 0.1, lx + r * 0.04, ly - r * 0.1, LIGHT);
      }
      // 持つ・置くとき（11/5 写真に合わせて描き直し）: 両目を 1 枚で覆うレンズ（まん中の下に鼻の切れ込み）、上のふち、後ろへ回るバンド
      const lens = `M${n(cx - h * 0.86)} ${n(cy - h * 0.3)}Q${n(cx)} ${n(cy - h * 0.44)} ${n(cx + h * 0.86)} ${n(cy - h * 0.3)}` +
        `Q${n(cx + h * 0.92)} ${n(cy + h * 0.26)} ${n(cx + h * 0.55)} ${n(cy + h * 0.3)}Q${n(cx + h * 0.22)} ${n(cy + h * 0.32)} ${n(cx + h * 0.13)} ${n(cy + h * 0.08)}` +
        `Q${n(cx)} ${n(cy - h * 0.04)} ${n(cx - h * 0.13)} ${n(cy + h * 0.08)}Q${n(cx - h * 0.22)} ${n(cy + h * 0.32)} ${n(cx - h * 0.55)} ${n(cy + h * 0.3)}` +
        `Q${n(cx - h * 0.92)} ${n(cy + h * 0.26)} ${n(cx - h * 0.86)} ${n(cy - h * 0.3)}Z`;
      return cord(`M${n(cx - h * 1.0)} ${n(cy - h * 0.08)}H${n(cx + h * 1.0)}`, W * 2.4, DARK) + path(lens, LIGHT) +
        cord(`M${n(cx - h * 0.8)} ${n(cy - h * 0.3)}Q${n(cx)} ${n(cy - h * 0.43)} ${n(cx + h * 0.8)} ${n(cy - h * 0.3)}`, W * 2.2, DARK) +
        shine(cx - h * 0.62, cy - h * 0.1, cx - h * 0.38, cy - h * 0.1, LIGHT) + shine(cx + h * 0.3, cy - h * 0.1, cx + h * 0.54, cy - h * 0.1, LIGHT);
    }
    case "knife": {
      // 包丁: 手に持つ濃い柄と鋲 2 つ、明るい刃（背はまっすぐ、刃先は切っ先へ上がる）、刃のつや。c は柄の真ん中
      const y0 = cy - h * 0.24;
      const y1 = cy + h * 0.22;
      return path(`M${n(X(h * 0.35))} ${n(y0)}L${n(X(h * 1.55))} ${n(y0)}Q${n(X(h * 1.75))} ${n(y0 + h * 0.02)} ${n(X(h * 1.78))} ${n(y0 + h * 0.06)}Q${n(X(h * 1.45))} ${n(y1)} ${n(X(h * 0.6))} ${n(y1)}L${n(X(h * 0.35))} ${n(y1 - h * 0.04)}Z`, LIGHT) +
        shine(X(h * 0.55), y0 + h * 0.12, X(h * 1.35), y0 + h * 0.12, LIGHT) +
        box(X(-h * 0.5), cy - h * 0.15, X(h * 0.3), cy + h * 0.15, COAL, h * 0.14) + box(X(h * 0.26), cy - h * 0.2, X(h * 0.4), cy + h * 0.2, STEEL, h * 0.04, 0.7) +
        dot(X(-h * 0.25), cy, h * 0.045, MID) + dot(X(h * 0.05), cy, h * 0.045, MID);
    }
    case "hot_pot": {
      // 熱い鍋: 濃い胴と両はしの取っ手、縁、ふたとつまみ、上へのぼる湯気 3 本。c は下の真ん中
      const y0 = cy - s * 0.42;
      let out = "";
      for (const k of [-1, 0, 1]) {
        const x = cx + k * s * 0.2;
        out += `<path d="M${n(x)} ${n(y0 - s * 0.24)}Q${n(x + s * 0.06)} ${n(y0 - s * 0.32)} ${n(x)} ${n(y0 - s * 0.4)}Q${n(x - s * 0.06)} ${n(y0 - s * 0.48)} ${n(x)} ${n(y0 - s * 0.56)}" fill="none" stroke="${MID}" stroke-width="${n(W * 1.2)}" stroke-linecap="round"/>`;
      }
      return out + [-1, 1].map((k) => box(cx + k * s * 0.4, y0 + s * 0.04, cx + k * s * 0.5, y0 + s * 0.12, DEEP, s * 0.03, 0.8)).join("") +
        box(cx - s * 0.4, y0, cx + s * 0.4, cy, DARK, s * 0.08) + shine(cx - s * 0.32, y0 + s * 0.14, cx - s * 0.32, y0 + s * 0.26, DARK) +
        path(`M${n(cx - s * 0.42)} ${n(y0 + s * 0.02)}Q${n(cx)} ${n(y0 - s * 0.18)} ${n(cx + s * 0.42)} ${n(y0 + s * 0.02)}Z`, STEEL) +
        box(cx - s * 0.06, y0 - s * 0.16, cx + s * 0.06, y0 - s * 0.07, DEEP, s * 0.03, 0.8);
    }
    case "cart": {
      // 台車: 平らな荷台、後ろ（向きと逆の側）の取っ手、黒い車輪 2 つと明るい軸。c は下の真ん中
      const py = cy - s * 0.24;
      return cord(`M${n(X(-s * 0.44))} ${n(py)}L${n(X(-s * 0.48))} ${n(cy - s * 0.9)}L${n(X(-s * 0.36))} ${n(cy - s * 0.94)}`, W * 2.8, MID) +
        [-0.34, 0.34].map((f) => ring(cx + f * s, cy - s * 0.09, s * 0.085, COAL) + dot(cx + f * s, cy - s * 0.09, s * 0.03, MID)).join("") +
        box(cx - h, py - s * 0.05, cx + h, py + s * 0.06, STEEL, s * 0.03);
    }
    case "forklift": {
      // フォークリフト（横から、向いている側に爪）: 胴と後ろの重り、屋根の柱と屋根、座席、前の柱と爪、大小の車輪。c は下の真ん中
      const wheel = (x: number, r: number) => ring(x, cy - r, r, COAL) + dot(x, cy - r, r * 0.38, MID);
      return [-0.33, 0.14].map((f) => cord(`M${n(X(f * s))} ${n(cy - s * 0.4)}L${n(X((f + 0.02) * s))} ${n(cy - s * 0.92)}`, W * 2.4, DARK)).join("") +
        box(X(-s * 0.42), cy - s * 0.98, X(s * 0.22), cy - s * 0.9, DARK, s * 0.03) +
        box(X(s * 0.3), cy - s * 1.0, X(s * 0.38), cy - s * 0.06, DARK, s * 0.02) +
        box(X(s * 0.38), cy - s * 0.46, X(s * 0.44), cy - s * 0.06, DEEP, s * 0.01, 0.8) + box(X(s * 0.38), cy - s * 0.1, X(s * 0.78), cy - s * 0.04, DEEP, s * 0.01, 0.8) +
        path(`M${n(X(-s * 0.56))} ${n(cy - s * 0.14)}V${n(cy - s * 0.38)}Q${n(X(-s * 0.56))} ${n(cy - s * 0.46)} ${n(X(-s * 0.46))} ${n(cy - s * 0.46)}H${n(X(-s * 0.08))}L${n(X(s * 0.06))} ${n(cy - s * 0.36)}H${n(X(s * 0.28))}V${n(cy - s * 0.14)}Z`, STEEL) +
        box(X(-s * 0.3), cy - s * 0.58, X(-s * 0.16), cy - s * 0.44, DEEP, s * 0.03, 0.8) + shine(X(-s * 0.5), cy - s * 0.36, X(-s * 0.5), cy - s * 0.24, STEEL) +
        wheel(X(-s * 0.36), s * 0.13) + wheel(X(s * 0.12), s * 0.12);
    }
    case "spill": {
      // こぼれた水・油: 床に広がる平たい水たまりと、つやの短い弧、そばの小さい粒 2 つ。c は水たまりの真ん中
      const k = [1, 0.82, 1.06, 0.9, 1, 0.78, 1.1, 0.92];
      const pt = (i: number): Pt => {
        const a = (i / k.length) * Math.PI * 2;
        return [cx + Math.cos(a) * h * k[i % k.length], cy + Math.sin(a) * h * 0.3 * k[i % k.length]];
      };
      let dd = "";
      for (let i = 0; i < k.length; i++) {
        const [x1, y1] = pt(i);
        const [x2, y2] = pt(i + 1);
        const m = [(x1 + x2) / 2, (y1 + y2) / 2];
        dd += i === 0 ? `M${n(m[0])} ${n(m[1])}` : `Q${n(x1)} ${n(y1)} ${n(m[0])} ${n(m[1])}`;
      }
      const [x0, y0] = pt(0);
      const [xa, ya] = pt(1);
      dd += `Q${n(x0)} ${n(y0)} ${n((x0 + xa) / 2)} ${n((y0 + ya) / 2)}Z`;
      return path(dd, LIGHT) + `<path d="M${n(cx - h * 0.5)} ${n(cy - h * 0.04)}Q${n(cx - h * 0.3)} ${n(cy - h * 0.16)} ${n(cx)} ${n(cy - h * 0.14)}" fill="none" stroke="${PAPER}" stroke-width="${n(W)}" stroke-linecap="round"/>` +
        ring(X(h * 1.15), cy - h * 0.12, h * 0.07, LIGHT, 0.7) + ring(X(h * 1.32), cy + h * 0.06, h * 0.05, LIGHT, 0.7);
    }
    case "bucket": {
      // バケツ: 下の狭い灰の胴と濃い縁、上の弧の取っ手、胴のつや。c は下の真ん中
      const y0 = cy - s * 0.6;
      return `<path d="M${n(cx - s * 0.36)} ${n(y0)}Q${n(cx)} ${n(y0 - s * 0.6)} ${n(cx + s * 0.36)} ${n(y0)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.2)}" stroke-linecap="round"/>` +
        path(`M${n(cx - s * 0.34)} ${n(y0)}H${n(cx + s * 0.34)}L${n(cx + s * 0.27)} ${n(cy - s * 0.04)}Q${n(cx + s * 0.26)} ${n(cy)} ${n(cx + s * 0.22)} ${n(cy)}H${n(cx - s * 0.22)}Q${n(cx - s * 0.26)} ${n(cy)} ${n(cx - s * 0.27)} ${n(cy - s * 0.04)}Z`, MID) +
        line(cx - s * 0.3, y0 + s * 0.2, cx + s * 0.3, y0 + s * 0.2, INK, 0.5) + shine(cx - s * 0.24, y0 + s * 0.3, cx - s * 0.21, y0 + s * 0.48, MID) +
        box(cx - s * 0.38, y0 - s * 0.04, cx + s * 0.38, y0 + s * 0.04, STEEL, s * 0.03);
    }
    case "mop": {
      // モップ: 柄の上を手に持ち、先は向いている側の下へ。先は濃い留め具と、明るい房（下の端が波）
      const bx = X(h * 0.55);
      const by = cy + h * 1.55;
      let fr = `M${n(bx - h * 0.45)} ${n(by)}H${n(bx + h * 0.45)}V${n(by + h * 0.4)}`;
      for (let k = 0; k < 4; k++) fr += `Q${n(bx + h * (0.45 - k * 0.225 - 0.11))} ${n(by + h * 0.62)} ${n(bx + h * (0.45 - (k + 1) * 0.225))} ${n(by + h * 0.4)}`;
      let out = cord(`M${n(X(-h * 0.06))} ${n(cy - h * 0.35)}L${n(bx)} ${n(by)}`, W * 2.6, MID) + path(`${fr}Z`, LIGHT);
      for (const k of [-0.22, 0, 0.22]) out += line(bx + k * h, by + h * 0.1, bx + k * h, by + h * 0.38, INK, 0.5);
      return out + box(bx - h * 0.3, by - h * 0.12, bx + h * 0.3, by + h * 0.06, DEEP, h * 0.04, 0.8);
    }
    case "chemical": {
      // 薬品の容器: 肩の付いた明るい胴、後ろの取っ手の輪、前の濃いふた、危ないの印（ひし形と「！」の線と点）の札。c は下の真ん中
      const y0 = cy - s * 0.78;
      return cord(`M${n(X(-s * 0.2))} ${n(y0 + s * 0.16)}Q${n(X(-s * 0.36))} ${n(y0 + s * 0.02)} ${n(X(-s * 0.18))} ${n(y0 - s * 0.02)}`, W * 2.6, LIGHT) +
        box(X(s * 0.06), y0 - s * 0.12, X(s * 0.2), y0 + s * 0.04, DEEP, s * 0.02, 0.8) +
        path(`M${n(cx - s * 0.3)} ${n(cy - s * 0.04)}V${n(y0 + s * 0.2)}Q${n(cx - s * 0.3)} ${n(y0 + s * 0.06)} ${n(cx - s * 0.16)} ${n(y0)}H${n(cx + s * 0.16)}Q${n(cx + s * 0.3)} ${n(y0 + s * 0.06)} ${n(cx + s * 0.3)} ${n(y0 + s * 0.2)}V${n(cy - s * 0.04)}Q${n(cx + s * 0.3)} ${n(cy)} ${n(cx + s * 0.26)} ${n(cy)}H${n(cx - s * 0.26)}Q${n(cx - s * 0.3)} ${n(cy)} ${n(cx - s * 0.3)} ${n(cy - s * 0.04)}Z`, LIGHT) +
        box(cx - s * 0.2, cy - s * 0.52, cx + s * 0.2, cy - s * 0.12, PAPER, s * 0.03, 0.7) +
        path(poly([[cx, cy - s * 0.48], [cx + s * 0.16, cy - s * 0.32], [cx, cy - s * 0.16], [cx - s * 0.16, cy - s * 0.32]]), PAPER, 0.8) +
        line(cx, cy - s * 0.4, cx, cy - s * 0.3, INK, 0.9) + dot(cx, cy - s * 0.24, W * 0.55);
    }
    case "gas_cylinder": {
      // ガスのボンベ: 丸い肩の細長い胴と濃い台の輪、肩の帯、上の弁と握り、胴のつや。c は下の真ん中
      const y0 = cy - s * 0.86;
      return box(cx - s * 0.05, y0 - s * 0.1, cx + s * 0.05, y0 + s * 0.04, DEEP, s * 0.015, 0.8) + box(cx - s * 0.12, y0 - s * 0.14, cx + s * 0.12, y0 - s * 0.08, DARK, s * 0.03, 0.8) +
        box(cx - s * 0.21, y0, cx + s * 0.21, cy - s * 0.03, STEEL, s * 0.2) + line(cx - s * 0.2 + W * 0.5, y0 + s * 0.26, cx + s * 0.2 - W * 0.5, y0 + s * 0.26, INK, 0.6) +
        shine(cx - s * 0.12, y0 + s * 0.34, cx - s * 0.12, y0 + s * 0.58, STEEL) + box(cx - s * 0.2, cy - s * 0.07, cx + s * 0.2, cy, DEEP, s * 0.02, 0.8);
    }
    case "hammer": {
      // 金づち: 手に持つ木の柄（上へのびる）と、柄の上の濃い頭（打つ面は向いている側）。c は柄を握るところ
      const hy = cy - h * 1.15;
      return cord(`M${n(cx)} ${n(cy + h * 0.35)}V${n(hy)}`, W * 3.4, MID) +
        box(X(-h * 0.42), hy - h * 0.2, X(h * 0.5), hy + h * 0.18, DARK, h * 0.06) + box(X(h * 0.46), hy - h * 0.24, X(h * 0.66), hy + h * 0.22, DEEP, h * 0.05, 0.8) +
        shine(X(-h * 0.28), hy - h * 0.08, X(h * 0.2), hy - h * 0.08, DARK);
    }
    case "wrench": {
      // スパナ: 手に持つ明るい軸、向いている側の開いた口、後ろの輪（穴は抜く）。重なりは 2 回描きでひと続きに。c は軸の握るところ
      const jx = X(h * 0.95);
      const R = h * 0.3;
      const ri = h * 0.15;
      const a = (34 * Math.PI) / 180;
      const op = (r: number, sg: number): string => `${n(jx + d * r * Math.cos(a))} ${n(cy - sg * r * Math.sin(a))}`;
      const f0 = d > 0 ? 0 : 1;
      const jaw = `M${op(R, 1)}A${n(R)} ${n(R)} 0 1 ${f0} ${op(R, -1)}L${op(ri, -1)}A${n(ri)} ${n(ri)} 0 1 ${1 - f0} ${op(ri, 1)}Z`;
      const ex = X(-h * 0.75);
      const ringD = `${circ(ex, cy, h * 0.26)}${circ(ex, cy, h * 0.11)}`;
      return merge([[rr(X(-h * 0.7), cy - h * 0.13, X(h * 0.8), cy + h * 0.13, h * 0.13), LIGHT], [jaw, LIGHT], [ringD, LIGHT]], ` fill-rule="evenodd"`) +
        shine(X(-h * 0.35), cy - h * 0.03, X(h * 0.4), cy - h * 0.03, LIGHT);
    }
    case "grinder": {
      // ディスクグラインダー: 手に持つ濃い胴と握りの筋、前の頭、下の明るい円盤と後ろ半分の覆い、前の下へ飛ぶ火花。c は胴を握るところ
      const gx = X(h * 0.98);
      const gy = cy + h * 0.52;
      const R = h * 0.44;
      let out = "";
      for (const [a, l] of [[20, 0.28], [45, 0.36], [70, 0.24]] as [number, number][]) {
        const r = (a * Math.PI) / 180;
        const x1 = gx + d * Math.cos(r) * (R + h * 0.1);
        const y1 = gy + Math.sin(r) * (R + h * 0.1);
        out += line(x1, y1, x1 + d * Math.cos(r) * h * l, y1 + Math.sin(r) * h * l, STEEL, 0.9);
      }
      const f = d > 0 ? 0 : 1;
      return out + box(X(-h * 0.55), cy - h * 0.21, X(h * 0.9), cy + h * 0.21, DARK, h * 0.21) +
        [-0.3, -0.15].map((k) => line(X(k * h), cy - h * 0.13, X(k * h), cy + h * 0.13, DEEP, 0.7)).join("") +
        box(X(h * 0.78), cy - h * 0.3, X(h * 1.16), cy + h * 0.2, DEEP, h * 0.08) +
        ring(gx, gy, R, LIGHT) + path(`M${n(gx)} ${n(gy - R - W)}A${n(R + W)} ${n(R + W)} 0 0 ${f} ${n(gx)} ${n(gy + R + W)}Z`, STEEL) + dot(gx, gy, h * 0.07, DEEP) +
        shine(X(-h * 0.35), cy - h * 0.1, X(h * 0.4), cy - h * 0.1, DARK);
    }
    case "gear": {
      // 回る機械（巻き込まれ）: 歯 8 つの灰の歯車と明るい軸、外を回る矢印。c は歯車の真ん中
      const pts: Pt[] = [];
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2;
        for (const [da, r] of [[-0.2, 0.3], [-0.12, 0.4], [0.12, 0.4], [0.2, 0.3]] as [number, number][]) pts.push([cx + Math.cos(a0 + da) * s * r, cy + Math.sin(a0 + da) * s * r]);
      }
      const ar = s * 0.48;
      const a1 = (-150 * Math.PI) / 180;
      const a2 = (-30 * Math.PI) / 180;
      const tip: Pt = [cx + Math.cos(a2) * ar, cy + Math.sin(a2) * ar];
      const hd = s * 0.09;
      return path(poly(pts), MID) + ring(cx, cy, s * 0.13, PAPER) + dot(cx, cy, s * 0.04) +
        `<path d="M${n(cx + Math.cos(a1) * ar)} ${n(cy + Math.sin(a1) * ar)}A${n(ar)} ${n(ar)} 0 0 1 ${n(tip[0] - hd * 0.5)} ${n(tip[1] - hd * 0.6)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.4)}" stroke-linecap="round"/>` +
        path(poly([[tip[0] + hd * 0.6, tip[1] + hd * 0.2], [tip[0] - hd * 1.2, tip[1] - hd * 0.1], [tip[0] - hd * 0.1, tip[1] - hd * 1.5]]), INK, 0.6);
    }
    case "sun": {
      // 暑さ（日差し）: 明るい灰の丸と 8 本の光の線。c は丸の真ん中
      let out = "";
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        out += line(cx + Math.cos(a) * s * 0.34, cy + Math.sin(a) * s * 0.34, cx + Math.cos(a) * s * 0.48, cy + Math.sin(a) * s * 0.48, INK, 1.4);
      }
      return out + ring(cx, cy, s * 0.25, LIGHT) + shine(cx - s * 0.14, cy - s * 0.08, cx - s * 0.06, cy - s * 0.16, LIGHT);
    }
    case "water_bottle": {
      // 水の入れ物（水分を取る）: 手に持つ明るい胴、濃いふた、札に雫の形、胴のつや。c は胴の真ん中
      const y0 = cy - h * 0.62;
      const y1 = cy + h * 0.62;
      return box(cx - h * 0.14, y0 - h * 0.28, cx + h * 0.14, y0 + h * 0.02, DEEP, h * 0.05, 0.8) +
        box(cx - h * 0.24, y0, cx + h * 0.24, y1, LIGHT, h * 0.12) + box(cx - h * 0.24, cy - h * 0.12, cx + h * 0.24, cy + h * 0.3, PAPER, 0, 0.6) +
        path(`M${n(cx)} ${n(cy - h * 0.04)}Q${n(cx + h * 0.1)} ${n(cy + h * 0.1)} ${n(cx)} ${n(cy + h * 0.2)}Q${n(cx - h * 0.1)} ${n(cy + h * 0.1)} ${n(cx)} ${n(cy - h * 0.04)}Z`, MID, 0.5) +
        shine(cx - h * 0.12, y0 + h * 0.12, cx - h * 0.12, y0 + h * 0.36, LIGHT);
    }
    case "faucet": {
      // 手洗いの蛇口: 壁の台、前へのびて下へ曲がる管、上の濃い取っ手、管の先から落ちる水の線と粒。c は壁の台
      const ex = X(h * 0.9);
      let out = cord(`M${n(cx)} ${n(cy)}H${n(ex - d * h * 0.1)}Q${n(ex)} ${n(cy)} ${n(ex)} ${n(cy + h * 0.15)}V${n(cy + h * 0.32)}`, W * 3.4, MID) +
        box(X(h * 0.32), cy - h * 0.42, X(h * 0.52), cy - h * 0.08, DARK, h * 0.05, 0.8) + box(X(h * 0.18), cy - h * 0.5, X(h * 0.66), cy - h * 0.38, DARK, h * 0.05, 0.8) +
        box(X(-h * 0.12), cy - h * 0.3, X(h * 0.08), cy + h * 0.3, STEEL, h * 0.05);
      for (const k of [-0.08, 0.08]) out += line(ex + k * h, cy + h * 0.5, ex + k * h, cy + h * 1.0, MID, 1.1);
      return out + path(`M${n(ex)} ${n(cy + h * 1.12)}Q${n(ex + h * 0.08)} ${n(cy + h * 1.26)} ${n(ex)} ${n(cy + h * 1.32)}Q${n(ex - h * 0.08)} ${n(cy + h * 1.26)} ${n(ex)} ${n(cy + h * 1.12)}Z`, LIGHT, 0.6);
    }
    case "radio": {
      // 無線機: 手に持つ濃い縦の箱、後ろの上の角から立つアンテナ、明るい表示、話す穴の線、上のつまみ。c は箱の真ん中
      const y0 = cy - h * 0.55;
      const y1 = cy + h * 0.55;
      return cord(`M${n(X(-h * 0.14))} ${n(y0)}V${n(y0 - h * 0.62)}`, W * 2.6, DARK) + box(X(h * 0.06), y0 - h * 0.16, X(h * 0.2), y0 + h * 0.02, DARK, h * 0.04, 0.8) +
        box(cx - h * 0.3, y0, cx + h * 0.3, y1, DEEP, h * 0.12) + box(cx - h * 0.2, y0 + h * 0.14, cx + h * 0.2, y0 + h * 0.42, LIGHT, h * 0.04, 0.6) +
        [0.6, 0.76, 0.92].map((f) => line(cx - h * 0.16, y0 + h * f, cx + h * 0.16, y0 + h * f, STEEL, 0.8)).join("") +
        shine(X(-h * 0.2), y0 + h * 0.56, X(-h * 0.2), y0 + h * 0.9, DEEP);
    }
    // ここから 11/5 電気の現場の道具と保護具（docs/props-2026-11-05.md）。写真は比率だけを見て、上の決まりで描く
    case "aed": {
      // AED: 上の取っ手、明るい箱、ふたの合わせ目、上の濃いハートと明るい稲妻、下の「AED」の字（線で描く。11/5 作者の判断で入れる）、
      // 箱のつや。c は箱の真ん中
      const bw = s * 0.9;
      const bh = s * 0.7;
      const x0 = cx - bw / 2;
      const y0 = cy - bh / 2;
      const r = s * 0.085;
      const hy = cy - s * 0.12;
      const gh = s * 0.13;
      const gw = gh * 0.7;
      const letters = icon ? "" : glyphs("AED", cx - glyphsWidth("AED", gw) / 2, cy + s * 0.04, gw, gh, W * 0.9);
      const heart = `M${n(cx)} ${n(hy + r * 1.6)}C${n(cx - r * 2.4)} ${n(hy + r * 0.2)} ${n(cx - r * 1.4)} ${n(hy - r * 1.7)} ${n(cx)} ${n(hy - r * 0.55)}` +
        `C${n(cx + r * 1.4)} ${n(hy - r * 1.7)} ${n(cx + r * 2.4)} ${n(hy + r * 0.2)} ${n(cx)} ${n(hy + r * 1.6)}Z`;
      const bolt = poly([[cx + r * 0.4, hy - r * 1.15], [cx - r * 0.42, hy + r * 0.12], [cx + r * 0.06, hy + r * 0.12], [cx - r * 0.34, hy + r * 1.15], [cx + r * 0.52, hy - r * 0.22], [cx + r * 0.06, hy - r * 0.22]]);
      return cord(`M${n(cx - s * 0.17)} ${n(y0)}V${n(y0 - s * 0.1)}H${n(cx + s * 0.17)}V${n(y0)}`, W * 2.6, DARK) +
        box(x0, y0, x0 + bw, y0 + bh, LIGHT, s * 0.1) + line(x0 + W, y0 + bh * 0.84, x0 + bw - W, y0 + bh * 0.84, INK, 0.6) +
        path(heart, DARK) + path(bolt, PAPER, 0.6) + letters + shine(x0 + bw * 0.1, y0 + bh * 0.16, x0 + bw * 0.1, y0 + bh * 0.42, LIGHT);
    }
    case "cubicle": {
      // キュービクル（屋外の受変電の箱）: 下の濃い台、明るい箱、扉 3 枚（合わせ目・窓・取っ手・下の通気の筋）、左の扉の危ないの印、
      // 箱より少し広い屋根と上の換気口。c は下の真ん中
      const bw = s * 0.96;
      const x0 = cx - bw / 2;
      const yb = cy - s * 0.07;
      const yt = cy - s * 0.72;
      let out = box(cx - s * 0.5, yb, cx + s * 0.5, cy, DARK, s * 0.015) + box(x0, yt, x0 + bw, yb, LIGHT, s * 0.03);
      for (const f of [1 / 3, 2 / 3]) out += line(x0 + bw * f, yt + W, x0 + bw * f, yb - W, INK, 0.6);
      for (let k = 0; k < 3; k++) {
        const dx = x0 + (bw * k) / 3;
        const dw = bw / 3;
        if (k > 0) out += box(dx + dw * 0.26, yt + s * 0.1, dx + dw * 0.74, yt + s * 0.19, DEEP, s * 0.02, 0.6);
        for (const v of [0.76, 0.83, 0.9]) out += line(dx + dw * 0.28, yt + (yb - yt) * v, dx + dw * 0.72, yt + (yb - yt) * v, INK, 0.5);
        out += line(dx + dw * (k === 2 ? 0.18 : 0.82), yt + (yb - yt) * 0.42, dx + dw * (k === 2 ? 0.18 : 0.82), yt + (yb - yt) * 0.54, INK, 0.9);
      }
      const mx = x0 + bw / 6;
      const my = yt + s * 0.15;
      const q = s * 0.055;
      out += path(poly([[mx, my - q], [mx + q, my], [mx, my + q], [mx - q, my]]), PAPER, 0.6) +
        `<path d="${poly([[mx + q * 0.22, my - q * 0.62], [mx - q * 0.3, my + q * 0.06], [mx + q * 0.04, my + q * 0.06], [mx - q * 0.2, my + q * 0.62], [mx + q * 0.34, my - q * 0.1], [mx, my - q * 0.1]])}" fill="${INK}"/>`;
      return out + box(cx - s * 0.13, yt - s * 0.1, cx + s * 0.13, yt - s * 0.02, STEEL, s * 0.015, 0.8) +
        box(cx - s * 0.52, yt - s * 0.04, cx + s * 0.52, yt + s * 0.025, STEEL, s * 0.012) + line(cx - s * 0.08, yt - s * 0.065, cx + s * 0.08, yt - s * 0.065, INK, 0.5);
    }
    case "wristband":
    case "armband": {
      // リストバンド・腕章: 腕に巻いた輪を少し上から見た形（奥の内側は濃く、手前の帯は明るい）。腕章は帯が広く、左寄りに小さい十字の印（11/5 作者の判断）。
      // 写真の字・会社名は入れない。手に着けたときは、手首の上を横切る帯。c は輪の真ん中
      if (worn && kind === "wristband") {
        const [ex, ey] = elbow ?? [cx, cy - s];
        const len = Math.hypot(cx - ex, cy - ey) || 1;
        const [ux, uy] = [(cx - ex) / len, (cy - ey) / len];
        const [bx, by] = [cx - ux * s * 0.42, cy - uy * s * 0.42];
        const l = s * 0.3;
        return cord(`M${n(bx - uy * l)} ${n(by + ux * l)}L${n(bx + uy * l)} ${n(by - ux * l)}`, s * 0.26, DARK);
      }
      const arm = kind === "armband";
      const w = h * (arm ? 0.85 : 0.62);
      const t = h * (arm ? 0.36 : 0.3);
      const bow = h * 0.18;
      const fill = arm ? PAPER : MID;
      const front = `M${n(cx - w)} ${n(cy - t)}Q${n(cx)} ${n(cy - t + bow)} ${n(cx + w)} ${n(cy - t)}V${n(cy + t)}Q${n(cx)} ${n(cy + t + bow)} ${n(cx - w)} ${n(cy + t)}Z`;
      const inner = `M${n(cx - w)} ${n(cy - t)}Q${n(cx)} ${n(cy - t - bow * 1.4)} ${n(cx + w)} ${n(cy - t)}Q${n(cx)} ${n(cy - t + bow)} ${n(cx - w)} ${n(cy - t)}Z`;
      let out = path(inner, arm ? MID : DEEP) + path(front, fill);
      if (arm) {
        const q = h * 0.09;
        const mx = cx - w * 0.45;
        const my = cy + bow * 0.4;
        out += `<path d="M${n(cx - w + W)} ${n(cy - t + h * 0.12)}Q${n(cx)} ${n(cy - t + h * 0.12 + bow)} ${n(cx + w - W)} ${n(cy - t + h * 0.12)}M${n(cx - w + W)} ${n(cy + t - h * 0.12)}Q${n(cx)} ${n(cy + t - h * 0.12 + bow)} ${n(cx + w - W)} ${n(cy + t - h * 0.12)}" fill="none" stroke="${MID}" stroke-width="${n(W * 0.7)}" stroke-linecap="round"/>` +
          path(poly([[mx - q, my - q * 3], [mx + q, my - q * 3], [mx + q, my - q], [mx + q * 3, my - q], [mx + q * 3, my + q], [mx + q, my + q], [mx + q, my + q * 3], [mx - q, my + q * 3], [mx - q, my + q], [mx - q * 3, my + q], [mx - q * 3, my - q], [mx - q, my - q]]), DEEP, 0.5);
      } else out += shine(cx - w * 0.7, cy - t * 0.2, cx - w * 0.7, cy + t * 0.5, MID);
      return out;
    }
    case "work_platform": {
      // 可搬式作業台（立馬）: 奥の手すり（2 本の柱と上の横棒）、両はしに外へ開く、はしごの形の脚（2 本の柱と 3 段の桟）、足の台、平らな天板。c は下の真ん中
      const ty = cy - s * 0.55;
      let out = cord(`M${n(cx - s * 0.34)} ${n(ty)}V${n(cy - s * 0.95)}H${n(cx + s * 0.34)}V${n(ty)}`, W * 2.2, STEEL);
      for (const k of [-1, 1]) {
        const rail = (top: number, foot: number) => cord(`M${n(cx + k * s * top)} ${n(ty)}L${n(cx + k * s * foot)} ${n(cy - W)}`, W * 2.6, MID);
        for (const f of [0.3, 0.55, 0.8]) {
          const y = ty + (cy - ty) * f;
          out += cord(`M${n(cx + k * s * (0.3 + 0.08 * f))} ${n(y)}H${n(cx + k * s * (0.42 + 0.1 * f))}`, W * 2.2, STEEL);
        }
        out += rail(0.3, 0.38) + rail(0.42, 0.52) +
          box(cx + k * s * 0.38 - s * 0.035, cy - s * 0.035, cx + k * s * 0.38 + s * 0.035, cy, DEEP, s * 0.01, 0.7) +
          box(cx + k * s * 0.52 - s * 0.035, cy - s * 0.035, cx + k * s * 0.52 + s * 0.035, cy, DEEP, s * 0.01, 0.7);
      }
      return out + box(cx - s * 0.47, ty - s * 0.04, cx + s * 0.47, ty + s * 0.03, STEEL, s * 0.012) + shine(cx - s * 0.4, ty - s * 0.005, cx - s * 0.2, ty - s * 0.005, STEEL);
    }
    case "rolling_scaffold": {
      // 可搬式移動足場: 下の段の X の筋かい、下の横棒、中の細いはしご（左の柱の内側）、両はしの柱、上の手すり 2 本、作業床、下の車輪。c は下の真ん中
      const L = cx - s * 0.34;
      const R = cx + s * 0.34;
      const yw = cy - s * 0.11;
      const yd = cy - s * 0.66;
      const yr = cy - s * 1.0;
      let out = cord(`M${n(L)} ${n(yw)}L${n(R)} ${n(yd)}M${n(R)} ${n(yw)}L${n(L)} ${n(yd)}`, W * 2.2, STEEL) + cord(`M${n(L)} ${n(yw)}H${n(R)}`, W * 2.2, STEEL);
      for (let k = 1; k <= 4; k++) {
        const y = yw - ((yw - yd) * k) / 5;
        out += cord(`M${n(L)} ${n(y)}H${n(L + s * 0.15)}`, W * 2.2, STEEL);
      }
      out += cord(`M${n(L + s * 0.15)} ${n(yw)}V${n(yd)}`, W * 2.2, STEEL) + cord(`M${n(L)} ${n(yr)}H${n(R)}M${n(L)} ${n(yr + s * 0.16)}H${n(R)}`, W * 2.4, MID);
      for (const x of [L, R]) out += cord(`M${n(x)} ${n(yw)}V${n(yr)}`, W * 2.8, MID);
      out += box(L - s * 0.05, yd - s * 0.035, R + s * 0.05, yd + s * 0.03, DARK, s * 0.01) + shine(L, yd - s * 0.003, L + s * 0.16, yd - s * 0.003, DARK);
      for (const x of [L, R]) out += cord(`M${n(x)} ${n(yw)}V${n(cy - s * 0.07)}`, W * 2.2, DARK) + ring(x, cy - s * 0.055, s * 0.05, COAL) + dot(x, cy - s * 0.055, s * 0.017, MID);
      return out;
    }
    case "safety_shoes":
    case "insulated_boots": {
      // 安全靴（短い靴・つま先の芯の線・甲のベルト）と、絶縁の長靴（ひざ下までの筒・口の明るい帯）。横から、つま先は向いている側。c は靴底の真ん中
      const tall = kind === "insulated_boots";
      const u = s / (tall ? 100 : 66);
      const P = (x: number, y: number) => `${n(X(x * u))} ${n(cy + y * u)}`;
      const top = tall ? -92 : -30;
      const back = tall ? -20 : -30;
      const shin = tall ? 8 : -6;
      const body = `M${P(back, -5)}L${P(back, top + 5)}Q${P(back, top)} ${P(back + 5, top)}L${P(shin - 5, top)}Q${P(shin, top)} ${P(shin, top + 5)}` +
        `L${P(shin, -24)}Q${P(32, -20)} ${P(33, -5)}Z`;
      let out = path(body, tall ? DEEP : DARK);
      if (tall) out += box(X(back * u), cy + top * u, X(shin * u), cy + (top + 12) * u, LIGHT, 2 * u, 0.8) + shine(X((back + 6) * u), cy + (top + 22) * u, X((back + 6) * u), cy + (top + 46) * u, DEEP);
      else {
        out += `<path d="M${P(14, -19)}Q${P(9, -12)} ${P(13, -6)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.6)}" stroke-linecap="round"/>` +
          path(`M${P(-12, -30)}L${P(-2, -30)}L${P(6, -18)}L${P(-6, -16)}Z`, DEEP, 0.6) + shine(X(-24 * u), cy - 22 * u, X(-24 * u), cy - 13 * u, DARK);
      }
      return out + box(X((back - 1.5) * u), cy - 6 * u, X(34 * u), cy, COAL, 2.5 * u);
    }
    case "cut_gloves":
    case "insulated_gloves": {
      // 手袋（11/5）。切創防止は薄い灰の手袋で、指先から手のひらが濃い（つけた樹脂）と、明るい編みの袖口。絶縁は濃いゴムの太い手袋で、
      // ひじの近くまで広がる長い袖口と口の巻き。着けたときは手の丸を覆う丸と親指（絶縁は前腕へのびる袖口も）。c は手
      const ins = kind === "insulated_gloves";
      const fill = ins ? DARK : MID;
      if (worn) {
        const [ex, ey] = elbow ?? [cx, cy - s];
        const len = Math.hypot(cx - ex, cy - ey) || 1;
        const [ux, uy] = [(cx - ex) / len, (cy - ey) / len];
        const r = s * 0.3;
        const cuff = ins ? cord(`M${n(cx)} ${n(cy)}L${n(cx - ux * Math.min(len * 0.6, s * 1.1))} ${n(cy - uy * Math.min(len * 0.6, s * 1.1))}`, s * 0.62, fill) : "";
        const hand = merge([[circ(cx, cy, r), fill], [circ(X(s * 0.22), cy - s * 0.2, s * 0.13), fill]]);
        if (ins) return cuff + hand;
        // 指先の側（ひじと反対）の半分を濃くする
        const rr2 = r * 0.92;
        const p1: Pt = [cx + uy * rr2, cy - ux * rr2];
        const pm: Pt = [cx + ux * rr2, cy + uy * rr2];
        const p2: Pt = [cx - uy * rr2, cy + ux * rr2];
        return hand + `<path d="M${n(p1[0])} ${n(p1[1])}A${n(rr2)} ${n(rr2)} 0 0 1 ${n(pm[0])} ${n(pm[1])}A${n(rr2)} ${n(rr2)} 0 0 1 ${n(p2[0])} ${n(p2[1])}Z" fill="${DEEP}"/>`;
      }
      const fw = s * (ins ? 0.075 : 0.065);
      const fx = ins ? [-0.22, -0.075, 0.075, 0.22] : [-0.21, -0.07, 0.07, 0.21];
      const fing = fx.map((f, i): [string, string] => [rr(cx + f * s - fw, cy - s * (0.46 - (i === 0 || i === 3 ? 0.07 : 0)), cx + f * s + fw, cy, fw), fill]);
      const thumb = `M${n(X(s * 0.16))} ${n(cy + s * 0.18)}L${n(X(s * 0.38))} ${n(cy - s * 0.1)}A${n(fw)} ${n(fw)} 0 0 ${d > 0 ? 1 : 0} ${n(X(s * 0.38 + fw * 1.4))} ${n(cy - s * 0.1 + fw * 1.1)}L${n(X(s * 0.26))} ${n(cy + s * 0.22)}Z`;
      const palm: [string, string] = [rr(cx - s * 0.3, cy - s * 0.18, cx + s * 0.3, cy + s * 0.24, s * 0.12), fill];
      if (ins) {
        const cuff: [string, string] = [`M${n(cx - s * 0.28)} ${n(cy + s * 0.12)}L${n(cx - s * 0.38)} ${n(cy + s * 0.78)}H${n(cx + s * 0.38)}L${n(cx + s * 0.28)} ${n(cy + s * 0.12)}Z`, fill];
        return merge([...fing, palm, [thumb, fill], cuff]) + box(cx - s * 0.4, cy + s * 0.72, cx + s * 0.4, cy + s * 0.82, STEEL, s * 0.04, 0.8) +
          shine(cx - s * 0.26, cy + s * 0.3, cx - s * 0.3, cy + s * 0.56, DARK);
      }
      // 指先の濃い樹脂（指ごとに上の 4 割）と、手のひらの下の端までの濃い面
      const tips = fx.map((f, i) => {
        const top = cy - s * (0.46 - (i === 0 || i === 3 ? 0.07 : 0));
        return `<path d="${rr(cx + f * s - fw + W * 0.5, top + W * 0.5, cx + f * s + fw - W * 0.5, top + s * 0.17, fw - W * 0.5)}" fill="${DEEP}"/>`;
      }).join("");
      return merge([...fing, palm, [thumb, fill]]) + tips + box(cx - s * 0.27, cy + s * 0.2, cx + s * 0.27, cy + s * 0.4, LIGHT, s * 0.04) +
        line(cx - s * 0.27 + W, cy + s * 0.3, cx + s * 0.27 - W, cy + s * 0.3, INK, 0.5);
    }
    case "voltage_detector": {
      // 検電器（ペンの形・11/5。今の tester とは別の名前）: 後ろのクリップ、細い先と先端、向いている側へ細くなる明るい頭（光る窓）、
      // 手に持つ濃い軸とボタン、頭のまわりの光の短い線 3 本、軸のつや。c は軸の握るところ
      const r = h * 0.17;
      const b0 = X(-h * 0.95);
      const b1 = X(h * 0.5);
      return cord(`M${n(X(-h * 0.75))} ${n(cy - r)}V${n(cy - r * 1.75)}H${n(X(-h * 0.15))}`, W * 2.2, STEEL) +
        cord(`M${n(X(h * 1.0))} ${n(cy)}H${n(X(h * 1.55))}`, W * 2, MID) + dot(X(h * 1.58), cy, W * 0.9) +
        path(`M${n(b1)} ${n(cy - r)}L${n(X(h * 1.05))} ${n(cy - r * 0.45)}V${n(cy + r * 0.45)}L${n(b1)} ${n(cy + r)}Z`, LIGHT) +
        box(b0, cy - r, b1, cy + r, DEEP, r) + ring(X(-h * 0.1), cy, r * 0.42, MID, 0.6) +
        [[0.6, -1.6, 0.52, -2.5], [0.82, -1.5, 0.86, -2.4], [1.02, -1.2, 1.18, -1.9]].map(([a, b, c2, e]) => line(X(h * a), cy + r * b, X(h * c2), cy + r * e, INK, 0.8)).join("") +
        shine(X(-h * 0.7), cy - r * 0.35, X(-h * 0.35), cy - r * 0.35, DEEP);
    }
    case "cooling_vest": {
      // 空調服（背中から）: 明るい上着の胴と両袖（重なりは 2 回描き）、上の襟、裾の線、腰の後ろの丸いファン 2 つ（濃い輪・羽根・軸）。c は胴の真ん中
      const sleeve = (k: number): [string, string] => [poly([[cx + k * h * 0.45, cy - h * 0.8], [cx + k * h * 0.76, cy - h * 0.7], [cx + k * h * 1.0, cy + h * 0.26], [cx + k * h * 0.72, cy + h * 0.33], [cx + k * h * 0.52, cy - h * 0.2]]), LIGHT];
      let out = merge([sleeve(-1), sleeve(1), [rr(cx - h * 0.6, cy - h * 0.85, cx + h * 0.6, cy + h * 0.85, h * 0.2), LIGHT]]) +
        box(cx - h * 0.28, cy - h * 0.95, cx + h * 0.28, cy - h * 0.76, STEEL, h * 0.07, 0.8) + line(cx - h * 0.6 + W, cy + h * 0.68, cx + h * 0.6 - W, cy + h * 0.68, INK, 0.6);
      for (const k of [-1, 1]) {
        const fx = cx + k * h * 0.29;
        const fy = cy + h * 0.32;
        const R = h * 0.2;
        out += ring(fx, fy, R, DEEP);
        for (let b = 0; b < 3; b++) {
          const a = (b * 2 * Math.PI) / 3 - Math.PI / 2;
          out += line(fx, fy, fx + Math.cos(a) * R * 0.72, fy + Math.sin(a) * R * 0.72, STEEL, 0.7);
        }
        out += dot(fx, fy, R * 0.22, MID);
      }
      return out;
    }
    case "step_stool": {
      // 簡易作業台（低い踏み台）: 下の足、少し下の広い明るい胴、横の持ち手の穴、縦の筋 2 本、上の天板とつや。c は下の真ん中
      const yt = cy - s * 0.42;
      return [-1, 1].map((k) => box(cx + k * s * 0.36 - s * 0.05, cy - s * 0.04, cx + k * s * 0.36 + s * 0.05, cy, DEEP, s * 0.01, 0.8)).join("") +
        path(`M${n(cx - s * 0.41)} ${n(yt)}H${n(cx + s * 0.41)}L${n(cx + s * 0.46)} ${n(cy - s * 0.04)}H${n(cx - s * 0.46)}Z`, LIGHT) +
        box(cx - s * 0.15, yt + s * 0.1, cx + s * 0.15, yt + s * 0.17, DEEP, s * 0.035, 0.6) +
        [-1, 1].map((k) => line(cx + k * s * 0.27, yt + s * 0.24, cx + k * s * 0.29, cy - s * 0.09, INK, 0.5)).join("") +
        box(cx - s * 0.47, yt - s * 0.06, cx + s * 0.47, yt + s * 0.02, STEEL, s * 0.02) + shine(cx - s * 0.4, yt - s * 0.025, cx - s * 0.2, yt - s * 0.025, STEEL);
    }
    case "crane": {
      // 重機（クレーン・横から、向いている側へブーム）: 後ろの張り出しの足、車体と車輪 3 つ、前の運転席と窓、上の回る台、ブームを起こす筒、
      // 2 段のブーム（中の細い段 → 外の太い段）、先の滑車、先から垂れるワイヤーとフック。吊り荷がつながっているときは、ワイヤーは吊り荷が描く。c は下の真ん中
      const [tx, ty] = craneTip([cx, cy], s, d);
      const px = X(-s * 0.2);
      const py = cy - s * 0.33;
      const at = (f: number): Pt => [px + (tx - px) * f, py + (ty - py) * f];
      const [mx, my] = at(0.55);
      const [qx, qy] = at(0.3);
      const wheel = (x: number) => ring(x, cy - s * 0.07, s * 0.07, COAL) + dot(x, cy - s * 0.07, s * 0.025, MID);
      let out = cord(`M${n(X(-s * 0.48))} ${n(cy - s * 0.16)}L${n(X(-s * 0.58))} ${n(cy - s * 0.04)}`, W * 2.2, DARK) + box(X(-s * 0.64), cy - s * 0.04, X(-s * 0.52), cy, DEEP, s * 0.01, 0.7) +
        box(X(-s * 0.52), cy - s * 0.22, X(s * 0.5), cy - s * 0.1, STEEL, s * 0.02) +
        box(X(s * 0.3), cy - s * 0.4, X(s * 0.5), cy - s * 0.17, LIGHT, s * 0.03) + box(X(s * 0.36), cy - s * 0.36, X(s * 0.46), cy - s * 0.27, DEEP, s * 0.015, 0.6) +
        wheel(X(-s * 0.38)) + wheel(X(-s * 0.2)) + wheel(X(s * 0.34)) +
        box(X(-s * 0.32), cy - s * 0.36, X(s * 0.08), cy - s * 0.21, DARK, s * 0.03) +
        cord(`M${n(X(s * 0.02))} ${n(cy - s * 0.26)}L${n(qx)} ${n(qy)}`, W * 2.4, DEEP) +
        cord(`M${n(px)} ${n(py)}L${n(tx)} ${n(ty)}`, W * 3.2, LIGHT) + cord(`M${n(px)} ${n(py)}L${n(mx)} ${n(my)}`, W * 4.6, MID) +
        ring(tx, ty, s * 0.03, DARK, 0.8);
      if (!linked) {
        const hy = cy - s * 0.5;
        out += line(tx, ty + s * 0.03, tx, hy - s * 0.05, INK, 1.1) +
          `<path d="M${n(tx)} ${n(hy - s * 0.05)}V${n(hy)}A${n(s * 0.04)} ${n(s * 0.04)} 0 1 1 ${n(tx - s * 0.07)} ${n(hy - s * 0.015)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.6)}" stroke-linecap="round"/>`;
      }
      return out;
    }
    case "dust_mask": {
      // 防塵マスク: 鼻と口を覆う濃い面体、両側の丸いフィルター（明るい輪と内の輪）、上と下のしめ紐、前の排気の丸、面体のつや。
      // 頭に着けたときは横から（顔の前の面体と、ほおのフィルター 1 つ、後ろへ回る紐）。c は面体の真ん中（頭に着けたときは頭）
      if (worn) {
        const r = s / 2.5;
        const fx = X(r * 0.62);
        const fy = cy + r * 0.56;
        return cord(`M${n(X(r * 0.4))} ${n(fy - r * 0.2)}Q${n(X(-r * 0.4))} ${n(cy - r * 0.05)} ${n(X(-r * 0.95))} ${n(cy - r * 0.1)}`, W * 2.2, DARK) +
          path(`M${n(X(r * 0.42))} ${n(fy - r * 0.32)}L${n(X(r * 0.86))} ${n(fy - r * 0.16)}Q${n(X(r * 0.96))} ${n(fy + r * 0.1)} ${n(X(r * 0.8))} ${n(fy + r * 0.3)}L${n(X(r * 0.42))} ${n(fy + r * 0.3)}Z`, DARK) +
          ring(X(r * 0.4), fy + r * 0.02, r * 0.2, LIGHT) + ring(X(r * 0.4), fy + r * 0.02, r * 0.09, LIGHT, 0.5);
      }
      const body = `M${n(cx)} ${n(cy - h * 0.62)}Q${n(cx + h * 0.42)} ${n(cy - h * 0.55)} ${n(cx + h * 0.45)} ${n(cy - h * 0.05)}Q${n(cx + h * 0.4)} ${n(cy + h * 0.45)} ${n(cx)} ${n(cy + h * 0.5)}` +
        `Q${n(cx - h * 0.4)} ${n(cy + h * 0.45)} ${n(cx - h * 0.45)} ${n(cy - h * 0.05)}Q${n(cx - h * 0.42)} ${n(cy - h * 0.55)} ${n(cx)} ${n(cy - h * 0.62)}Z`;
      return [-1, 1].map((k) => cord(`M${n(cx + k * h * 0.3)} ${n(cy - h * 0.42)}L${n(cx + k * h * 0.95)} ${n(cy - h * 0.8)}M${n(cx + k * h * 0.6)} ${n(cy + h * 0.2)}L${n(cx + k * h * 0.98)} ${n(cy + h * 0.1)}`, W * 2, DARK)).join("") +
        path(body, DARK) + shine(cx - h * 0.22, cy - h * 0.38, cx - h * 0.3, cy - h * 0.12, DARK) +
        [-1, 1].map((k) => ring(cx + k * h * 0.56, cy + h * 0.14, h * 0.3, LIGHT) + ring(cx + k * h * 0.56, cy + h * 0.14, h * 0.15, LIGHT, 0.5)).join("") +
        ring(cx, cy + h * 0.24, h * 0.1, DEEP, 0.6);
    }
    case "power_drill": {
      // 電動工具（ドリル・横から）: 前の細い刃とねじれの筋、下の電池、手に持つ黒い握り、握りの前の引き金、上の濃い胴と後ろの通気の筋、
      // 前のチャック、胴のつや。会社の色やロゴは描かない。c は握るところ
      const yb = cy - h * 0.62;
      const by = yb - h * 0.22;
      return cord(`M${n(X(h * 0.95))} ${n(by)}H${n(X(h * 1.62))}`, W * 2.2, LIGHT) +
        [0, 1, 2].map((k) => line(X(h * (1.1 + k * 0.17)), by - h * 0.07, X(h * (1.18 + k * 0.17)), by + h * 0.07, INK, 0.5)).join("") +
        box(X(-h * 0.55), cy + h * 0.44, X(h * 0.32), cy + h * 0.78, STEEL, h * 0.06) +
        path(poly([[X(-h * 0.05), yb], [X(h * 0.28), yb], [X(h * 0.12), cy + h * 0.5], [X(-h * 0.22), cy + h * 0.5]]), COAL) +
        box(X(h * 0.24), cy - h * 0.52, X(h * 0.36), cy - h * 0.3, DEEP, h * 0.03, 0.7) +
        box(X(-h * 0.62), yb - h * 0.44, X(h * 0.62), yb + h * 0.02, DARK, h * 0.2) +
        [-0.45, -0.32].map((k) => line(X(h * k), yb - h * 0.3, X(h * k), yb - h * 0.12, INK, 0.6)).join("") +
        box(X(h * 0.6), yb - h * 0.38, X(h * 0.96), yb - h * 0.06, DEEP, h * 0.06, 0.8) + line(X(h * 0.78), yb - h * 0.34, X(h * 0.78), yb - h * 0.1, INK, 0.5) +
        shine(X(-h * 0.2), yb - h * 0.34, X(h * 0.25), yb - h * 0.34, DARK);
    }
    case "aerial_platform": {
      // 高所作業車（シザー式・横から）: 交差する腕 3 段とまん中のピン、かごの手すり（柱と上と中の横棒）、作業床、かごの操作盤、
      // 下の濃い車体と車輪 2 つ、車体のつや。c は下の真ん中
      const yb = cy - s * 0.2;
      const yd = cy - s * 0.74;
      const L = cx - s * 0.32;
      const R = cx + s * 0.32;
      let arms = "";
      let pins = "";
      for (let k = 0; k < 3; k++) {
        const y0 = yb - ((yb - yd) * k) / 3;
        const y1 = yb - ((yb - yd) * (k + 1)) / 3;
        arms += `M${n(L)} ${n(y0)}L${n(R)} ${n(y1)}M${n(R)} ${n(y0)}L${n(L)} ${n(y1)}`;
        pins += dot(cx, (y0 + y1) / 2, W * 0.8);
      }
      return cord(arms, W * 2.4, MID) + pins +
        cord(`M${n(L - s * 0.08)} ${n(yd)}V${n(cy - s * 1.04)}H${n(R + s * 0.08)}V${n(yd)}M${n(L - s * 0.08)} ${n(cy - s * 0.9)}H${n(R + s * 0.08)}`, W * 2.2, STEEL) +
        box(X(s * 0.18), cy - s * 0.98, X(s * 0.3), cy - s * 0.88, DEEP, s * 0.015, 0.7) +
        box(L - s * 0.12, yd - s * 0.04, R + s * 0.12, yd + s * 0.03, DARK, s * 0.01) +
        box(cx - s * 0.46, cy - s * 0.24, cx + s * 0.46, cy - s * 0.1, DARK, s * 0.03) + shine(cx - s * 0.38, cy - s * 0.2, cx - s * 0.18, cy - s * 0.2, DARK) +
        [-0.3, 0.3].map((f) => ring(cx + f * s, cy - s * 0.08, s * 0.08, COAL) + dot(cx + f * s, cy - s * 0.08, s * 0.028, MID)).join("");
    }
    case "bulb_flicker":
    case "bulb_steady":
    case "bulb_off": {
      // 電球（11/6）: 丸いガラスと首、ねじの口金、中のフィラメント。安定した電球は、まわりに同じ長さの光の線。
      // ちらつく電球は、ガラスを一段暗くし、横へずれたもう 1 つの輪郭（ぶれて見える）と、長さと向きのそろわないギザギザの短い線 4 本。
      // 手に持つ・吹き出しの中ではガラスが上（c は口金の真ん中）。キャンバスに置くと天井からコードで下がり、ガラスが下（c はガラスの真ん中）
      const flicker = kind === "bulb_flicker";
      // 明かりの消えた電球（11/6 昼）: 安定した電球と同じ形で、ガラスをグレー（MID）にし、光の線を出さない
      const off = kind === "bulb_off";
      // 吹き出しの中では、光の線まで含めて枠に収まるよう小さめにし、全体の真ん中を c にする
      const r = h * (icon ? 0.4 : 0.55);
      const hang = !icon && !body;
      const sd = hang ? -1 : 1; // 口金の向き（ガラスから見て。1 で下）
      const gy = hang ? cy : icon ? cy - r * 0.28 : cy - r * 1.3;
      const neck = (k: number) => gy + sd * r * k;
      const glass = poly([[cx - r * 0.5, neck(0.82)], [cx - r * 0.4, neck(1.08)], [cx + r * 0.4, neck(1.08)], [cx + r * 0.5, neck(0.82)]]);
      const capA = neck(1.05);
      const capB = neck(1.55);
      let out = "";
      if (hang) out += cord(`M${n(cx)} ${n(topY ?? Math.max(0, gy - h * 2.2))}V${n(capB)}`, W * 2, DARK);
      if (flicker) out += `<path d="${circ(cx + r * 0.24, gy - r * 0.1, r)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.7)}" stroke-dasharray="${n(W * 1.6)} ${n(W * 1.3)}" stroke-linecap="round"/>`;
      out += off ? merge([[circ(cx, gy, r), MID], [glass, MID]]) : merge([[circ(cx, gy, r), flicker ? LIGHT : PAPER], [glass, flicker ? LIGHT : PAPER]]);
      out += box(cx - r * 0.42, Math.min(capA, capB), cx + r * 0.42, Math.max(capA, capB), STEEL, r * 0.08, 0.8) +
        line(cx - r * 0.36, neck(1.22), cx + r * 0.36, neck(1.22), INK, 0.5) + line(cx - r * 0.36, neck(1.38), cx + r * 0.36, neck(1.38), INK, 0.5);
      // フィラメント: 口金から伸びる 2 本の足と、先の小さな山
      out += `<path d="M${n(cx - r * 0.2)} ${n(neck(0.95))}L${n(cx - r * 0.2)} ${n(neck(0.15))}L${n(cx - r * 0.07)} ${n(neck(-0.05))}L${n(cx + r * 0.07)} ${n(neck(0.15))}L${n(cx + r * 0.2)} ${n(neck(-0.05))}V${n(neck(0.95))}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.6)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (off) {
        // 消えた電球は光の線を出さない
      } else if (!flicker) {
        // 同じ長さの光の線 7 本（口金の側には出さない）
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          if (Math.abs(Math.sin(a) * sd - 1) < 0.01) continue;
          out += line(cx + Math.cos(a) * r * 1.3, gy + Math.sin(a) * r * 1.3, cx + Math.cos(a) * r * 1.75, gy + Math.sin(a) * r * 1.75, INK, 1);
        }
      } else {
        // ギザギザの短い線: 向きも長さもそろえない
        const zig = (a: number, r0: number, r1: number) => {
          const [ux, uy] = [Math.cos(a), Math.sin(a)];
          const pts: Pt[] = [0, 1, 2, 3].map((k) => {
            const t = r0 + ((r1 - r0) * k) / 3;
            const o = (k % 2 ? 1 : -1) * r * 0.2;
            return [cx + ux * t - uy * o, gy + uy * t + ux * o];
          });
          return `<polyline points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="none" stroke="${INK}" stroke-width="${n(W)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        };
        const up = -sd; // ガラスの側
        out += zig(Math.atan2(up * 0.9, -0.6), r * 1.3, r * 2.1) + zig(Math.atan2(up * 0.45, 1), r * 1.35, r * 1.85) +
          zig(Math.atan2(-up * 0.15, -1), r * 1.35, r * 1.8) + zig(Math.atan2(up * 1, 0.3), r * 1.4, r * 2.3);
      }
      return out;
    }
    case "danger_zone": {
      // 床の上の範囲（11/6）: 床に描いた点線の楕円。吊り荷の真下などの立ち入らない所。中は紙の白で塗り、床の線を隠して「床の上の範囲」に見せる。c は真ん中、幅が size
      const rx = h;
      const ry = Math.max(h * 0.16, W * 3);
      const e = `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
      return `<path d="${e}" fill="${PAPER}" stroke="none"/>` +
        `<path d="${e}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.5)}" stroke-dasharray="0 ${n(W * 3)}" stroke-linecap="round"/>`;
    }
    case "partition": {
      // 低い仕切り（11/6）: 床に立つ板（少し奥へ傾いた面）と、下の横長の足。c は下の真ん中、高さが size
      const t = s * 0.07;
      const top = cy - s;
      const face = poly([[cx - t, cy - s * 0.06], [cx - t, top + t * 0.6], [cx + t, top], [cx + t, cy - s * 0.06 - t * 0.6]]);
      return box(cx - s * 0.24, cy - s * 0.07, cx + s * 0.24, cy, DEEP, s * 0.02) + path(face, MID) +
        line(cx - t * 0.4, top + s * 0.12, cx - t * 0.4, cy - s * 0.18, LIGHT, 0.7);
    }
    case "wire_broken": {
      // 切れた電線（11/6）: 左右の 2 本の被覆が、真ん中で切れて少し垂れ下がる。切れ口からは明るい芯が 2 本ずつ、上下に開いて飛び出す。
      // 火花は描かない。芯は被覆のあとに描く（被覆に隠れると矢じりに見えた）。c は切れた所の真ん中、全体の長さが size
      const gap = s * 0.11;
      const drop = h * 0.14;
      let out = "";
      for (const k of [-1, 1]) {
        const end = cx + k * gap;
        out += cord(`M${n(cx + k * h)} ${n(cy - drop)}C${n(cx + k * h * 0.6)} ${n(cy - drop)} ${n(end + k * s * 0.08)} ${n(cy - drop * 0.6)} ${n(end)} ${n(cy)}`, W * 3.6, DARK);
      }
      for (const k of [-1, 1]) {
        const end = cx + k * gap;
        for (const v of [-1, 1]) {
          const tip: Pt = [end - k * s * 0.075, cy + v * h * 0.1 + h * 0.03];
          out += cord(`M${n(end)} ${n(cy + v * W * 0.5)}L${n(tip[0])} ${n(tip[1])}`, W * 1.7, PAPER);
        }
      }
      return out;
    }
    case "distance_3m": {
      // 距離の札（11/6 朝 作者「3 メートル離れる」）: 横の矢印（両はしに矢じりと縦の線）と、まん中の上に「3m」を線で描いた札。
      // c は矢印のまん中、矢印の長さが size。人の足もとの高さに置き、2 人のあいだの距離を示す
      const label = "3m";
      const l = cx - s / 2;
      const r = cx + s / 2;
      const aw = Math.max(W * 2.2, s * 0.05);
      let out = line(l + aw, cy, r - aw, cy, INK, 1.3) +
        path(poly([[l, cy], [l + aw * 1.3, cy - aw * 0.75], [l + aw * 1.3, cy + aw * 0.75]]), INK, 0.6) +
        path(poly([[r, cy], [r - aw * 1.3, cy - aw * 0.75], [r - aw * 1.3, cy + aw * 0.75]]), INK, 0.6) +
        line(l, cy - aw * 1.4, l, cy + aw * 1.4, INK, 1) + line(r, cy - aw * 1.4, r, cy + aw * 1.4, INK, 1);
      const gh = Math.max(W * 5, Math.min(s * 0.12, W * 10));
      const gw = gh * 0.6;
      const tw = glyphsWidth(label, gw);
      const pad = gh * 0.35;
      const yb = cy - aw * 1.6;
      out += box(cx - tw / 2 - pad, yb - gh - pad * 2, cx + tw / 2 + pad, yb, PAPER, pad) + glyphs(label, cx - tw / 2, yb - gh - pad, gw, gh, W * 1.15);
      return out;
    }
    case "height_2m": {
      // 高さの札（11/6）: 床から上へ向く縦の矢印（両はしに矢じりと横の線）と、まん中の右に「2m」を線で描いた札。
      // 字は数字と単位だけ（たった時間の札と同じ扱い。作者の判断）。c は下の真ん中（床）、矢印の長さが size
      const label = HEIGHT_LABEL[kind]!;
      const t = cy - s;
      const aw = Math.max(W * 2.2, s * 0.06);
      let out = line(cx, t + aw, cx, cy - aw, INK, 1.3) +
        path(poly([[cx, t], [cx - aw * 0.75, t + aw * 1.3], [cx + aw * 0.75, t + aw * 1.3]]), INK, 0.6) +
        path(poly([[cx, cy], [cx - aw * 0.75, cy - aw * 1.3], [cx + aw * 0.75, cy - aw * 1.3]]), INK, 0.6) +
        line(cx - aw * 1.4, t, cx + aw * 1.4, t, INK, 1) + line(cx - aw * 1.4, cy, cx + aw * 1.4, cy, INK, 1);
      const gh = Math.max(W * 5, Math.min(s * 0.18, W * 10));
      const gw = gh * 0.6;
      const tw = glyphsWidth(label, gw);
      const pad = gh * 0.35;
      const x0 = cx + aw * 1.2;
      const ym = cy - s / 2;
      out += box(x0, ym - gh / 2 - pad, x0 + tw + pad * 2, ym + gh / 2 + pad, PAPER, pad) + glyphs(label, x0 + pad, ym - gh / 2, gw, gh, W * 1.15);
      return out;
    }
    case "fever": {
      // 熱がある顔（11/6）: 丸い顔に、つらそうに閉じた目、ほおの斜線 3 本ずつ、口にくわえた体温計（先の丸が口の中）、頭の上の湯気 3 本。c は顔の真ん中
      // 顔と湯気を合わせた高さの真ん中が c に来るよう、顔を少し下げる
      const r = h * 0.68;
      const fy = cy + r * 0.4;
      let out = ring(cx, fy, r, PAPER);
      for (const k of [-1, 1]) {
        // ぎゅっと閉じた目（＞ ＜）。笑った目（へ）に見えないように
        const ex = cx + k * r * 0.36;
        out += `<polyline points="${n(ex + k * r * 0.13)},${n(fy - r * 0.36)} ${n(ex - k * r * 0.11)},${n(fy - r * 0.24)} ${n(ex + k * r * 0.13)},${n(fy - r * 0.12)}" fill="none" stroke="${INK}" stroke-width="${n(W)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        for (let q = 0; q < 3; q++) {
          const hx = cx + k * r * (0.34 + q * 0.13);
          out += line(hx - r * 0.06, fy + r * 0.2, hx + r * 0.06, fy + r * 0.04, INK, 0.6);
        }
      }
      // 体温計: 口から斜め下へ出る細い軸（中に濃い線）
      const m: Pt = [cx + r * 0.05, fy + r * 0.48];
      const e: Pt = [cx + r * 1.05, fy + r * 0.92];
      out += cord(`M${n(m[0])} ${n(m[1])}L${n(e[0])} ${n(e[1])}`, W * 2.4, PAPER) + line(m[0] + r * 0.2, m[1] + r * 0.09, e[0] - r * 0.08, e[1] - r * 0.035, DARK, 0.6) +
        dot(m[0], m[1], W * 1.1) + `<path d="M${n(cx - r * 0.22)} ${n(fy + r * 0.5)}Q${n(cx - r * 0.05)} ${n(fy + r * 0.42)} ${n(m[0])} ${n(m[1])}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.8)}" stroke-linecap="round"/>`;
      // 湯気: 頭の上のゆれる線 3 本
      for (const k of [-1, 0, 1]) {
        const x = cx + k * r * 0.45;
        const y0 = fy - r * 1.12;
        out += `<path d="M${n(x)} ${n(y0)}Q${n(x - r * 0.14)} ${n(y0 - r * 0.18)} ${n(x)} ${n(y0 - r * 0.36)}Q${n(x + r * 0.14)} ${n(y0 - r * 0.54)} ${n(x)} ${n(y0 - r * 0.72)}" fill="none" stroke="${INK}" stroke-width="${n(W * 0.9)}" stroke-linecap="round"/>`;
      }
      return out;
    }
    case "chair": {
      // 椅子（11/6。横から、休憩所の金属の脚の椅子）: 後ろ（向きと逆の側）の脚から立ち上がる背もたれの柱と板、前の脚、脚の間の横の棒、
      // 明るい座面とつや。座る人の脚が前へ出るので、背もたれは向きと逆の側。c は下の真ん中
      const seat = cy - s * (SEAT_TOP.chair ?? 0.46);
      const bx = X(-s * 0.22);
      const fx = X(s * 0.22);
      return cord(`M${n(X(-s * 0.25))} ${n(cy - W)}L${n(bx)} ${n(seat + s * 0.06)}L${n(X(-s * 0.26))} ${n(cy - s * 0.96)}`, W * 2.6, STEEL) +
        cord(`M${n(X(s * 0.25))} ${n(cy - W)}L${n(fx)} ${n(seat + s * 0.06)}`, W * 2.6, STEEL) +
        line(X(-s * 0.235), cy - s * 0.16, X(s * 0.235), cy - s * 0.16, INK, 0.8) +
        box(X(-s * 0.31), cy - s * 0.94, X(-s * 0.2), cy - s * 0.66, DARK, s * 0.03) +
        box(X(-s * 0.27), seat, X(s * 0.29), seat + s * 0.08, LIGHT, s * 0.03) + shine(X(-s * 0.18), seat + s * 0.035, X(s * 0.05), seat + s * 0.035, LIGHT);
    }
    case "label_teiatsu":
    case "label_anzen": {
      // 漢字 4 文字の札（11/6 昼。「低圧停電」「安全確認」）: 紙の白の札に黒い字。カードの右上の空きに置く。c は札の真ん中、札の幅が size。
      // 字は字形の塗りの path（KANJI）。絵の面に text を置かない決まりは守る。字を入れるのは、たった時間の札と同じ扱いの例外（作者の判断）
      const label = KANJI_LABEL[kind]!;
      const g = s / (label.length + 0.68);
      const pad = g * 0.22;
      const gap = g * 0.08;
      const bh = g + pad * 2;
      let out = box(cx - h, cy - bh / 2, cx + h, cy + bh / 2, PAPER, pad, 1.2);
      [...label].forEach((ch, k) => {
        const x = cx - h + pad + k * (g + gap);
        out += `<path d="${KANJI[ch]}" fill="${INK}" transform="translate(${n(x)} ${n(cy - g / 2)}) scale(${(g / 1000).toFixed(4)})"/>`;
      });
      return out;
    }
    case "safety_cross": {
      // 安全の十字の印（11/6 昼）: 紙の白の角の丸い四角に、濃い太い十字（緑十字の代わりに白黒で）。c は真ん中、幅が size
      const a = h * 0.62;
      const t = h * 0.2;
      return box(cx - h, cy - h, cx + h, cy + h, PAPER, h * 0.2, 1.2) +
        path(poly([[cx - t, cy - a], [cx + t, cy - a], [cx + t, cy - t], [cx + a, cy - t], [cx + a, cy + t], [cx + t, cy + t], [cx + t, cy + a], [cx - t, cy + a], [cx - t, cy + t], [cx - a, cy + t], [cx - a, cy - t], [cx - t, cy - t]]), COAL, 0.8);
    }
    case "count_3sec": {
      // 「1…2…3 SEC」（11/6 昼。333 運動の 3 秒）: 数字と点々と SEC を線で描く。たった時間の札と同じ扱い。
      // 吹き出しの中（icon）は札なしで幅が size の 2.3 倍、キャンバスに置くと紙の白の札で幅が size。c は真ん中
      const wt = icon ? s * 2.3 : s * 0.86;
      const gw = wt / countUnits();
      const gh = gw / 0.55;
      const sw = Math.max(W * (icon ? 0.9 : 1.15), gh * 0.13);
      const plate = icon ? "" : box(cx - h, cy - gh * 0.95, cx + h, cy + gh * 0.95, PAPER, gh * 0.4);
      return plate + countGlyphs(cx - wt / 2, cy - gh / 2, gw, gh, sw);
    }
    case "healthy": {
      // 元気に笑った顔（11/6 昼。熱の顔 fever と対）: 丸い顔に、笑って細めた目（∩）、大きく開けて笑う口、ほおの丸、頭の右上の元気の線 3 本。c は顔の真ん中
      const r = h * 0.68;
      const fy = cy + r * 0.12;
      let out = ring(cx, fy, r, PAPER);
      for (const k of [-1, 1]) {
        const ex = cx + k * r * 0.36;
        const ey = fy - r * 0.18;
        out += `<path d="M${n(ex - r * 0.15)} ${n(ey + r * 0.05)}Q${n(ex)} ${n(ey - r * 0.2)} ${n(ex + r * 0.15)} ${n(ey + r * 0.05)}" fill="none" stroke="${INK}" stroke-width="${n(W)}" stroke-linecap="round"/>`;
        out += dot(cx + k * r * 0.58, fy + r * 0.22, r * 0.11, LIGHT);
      }
      out += path(`M${n(cx - r * 0.42)} ${n(fy + r * 0.16)}Q${n(cx)} ${n(fy + r * 0.24)} ${n(cx + r * 0.42)} ${n(fy + r * 0.16)}Q${n(cx + r * 0.36)} ${n(fy + r * 0.72)} ${n(cx)} ${n(fy + r * 0.72)}Q${n(cx - r * 0.36)} ${n(fy + r * 0.72)} ${n(cx - r * 0.42)} ${n(fy + r * 0.16)}Z`, DEEP, 0.8);
      out += `<path d="M${n(cx - r * 0.2)} ${n(fy + r * 0.6)}Q${n(cx)} ${n(fy + r * 0.48)} ${n(cx + r * 0.2)} ${n(fy + r * 0.6)}Q${n(cx)} ${n(fy + r * 0.7)} ${n(cx - r * 0.2)} ${n(fy + r * 0.6)}Z" fill="${MID}"/>`;
      for (const a of [-1.15, -0.75, -0.35]) out += line(cx + Math.cos(a) * r * 1.18, fy + Math.sin(a) * r * 1.18, cx + Math.cos(a) * r * 1.42, fy + Math.sin(a) * r * 1.42, INK, 1);
      return out;
    }
  }
}

/**
 * 線で描く字（11/5。たった時間の札の「10min」だけに使う）。絵の面に text 要素を置かない決まり（style.ts）を守るため、
 * 字は幅 1・高さ 1 の枠の中の折れ線で持つ（y は上が 0）。小文字は枠の下 6 割に収める
 */
const GLYPH: Record<string, { w: number; d: string[]; dots?: [number, number][] }> = {
  "0": { w: 1, d: ["M0 0H1V1H0Z"] },
  "1": { w: 0.6, d: ["M0.1 0.2L0.4 0V1"] },
  // 高さの札の「2m」（11/6）
  "2": { w: 1, d: ["M0 0H1V0.5H0V1H1"] },
  "3": { w: 1, d: ["M0 0H1V1H0", "M0.25 0.5H1"] },
  "5": { w: 1, d: ["M1 0H0V0.48H1V1H0"] },
  m: { w: 1.2, d: ["M0 1V0.4H1.2V1", "M0.6 0.4V1"] },
  i: { w: 0.3, d: ["M0.15 0.4V1"], dots: [[0.15, 0.18]] },
  n: { w: 0.9, d: ["M0 1V0.4H0.9V1"] },
  h: { w: 0.9, d: ["M0 0V1", "M0 0.4H0.9V1"] },
  // AED の箱の字（11/5 作者の判断で入れる）
  A: { w: 0.9, d: ["M0 1L0.45 0L0.9 1", "M0.2 0.62H0.7"] },
  E: { w: 0.72, d: ["M0.72 0H0V1H0.72", "M0 0.5H0.6"] },
  D: { w: 0.85, d: ["M0 0H0.42L0.85 0.3V0.7L0.42 1H0Z"] },
  // 11/6 昼: チェック表の丸数字の 4・6 と、「1…2…3 SEC」の S・C
  "4": { w: 1, d: ["M0.75 1V0L0 0.68H1"] },
  "6": { w: 1, d: ["M0.9 0H0V1H1V0.5H0"] },
  S: { w: 0.8, d: ["M0.8 0.1L0.62 0H0.18L0 0.12V0.38L0.18 0.5H0.62L0.8 0.62V0.88L0.62 1H0.18L0 0.9"] },
  C: { w: 0.8, d: ["M0.8 0.1L0.6 0H0.2L0 0.15V0.85L0.2 1H0.6L0.8 0.9"] },
};
const GAP = 0.35;
function glyphsWidth(text: string, gw: number): number {
  return [...text].reduce((a, ch, i) => a + (GLYPH[ch]?.w ?? 1) * gw + (i ? GAP * gw : 0), 0);
}
function glyphs(text: string, x0: number, y0: number, gw: number, gh: number, sw: number): string {
  let x = x0;
  let out = "";
  for (const ch of text) {
    const g = GLYPH[ch];
    if (!g) continue;
    const tr = (d: string) => d.replace(/([MLHVZ])([^MLHVZ]*)/g, (_, c: string, args: string) => {
      const v = args.trim().split(/\s+/).filter(Boolean).map(Number);
      if (c === "H") return `H${n(x + v[0] * gw)}`;
      if (c === "V") return `V${n(y0 + v[0] * gh)}`;
      if (c === "Z") return "Z";
      return `${c}${n(x + v[0] * gw)} ${n(y0 + v[1] * gh)}`;
    });
    for (const d of g.d) out += `<path d="${tr(d)}" fill="none" stroke="${INK}" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const [px, py] of g.dots ?? []) out += `<circle cx="${n(x + px * gw)}" cy="${n(y0 + py * gh)}" r="${n(sw * 0.75)}" fill="${INK}"/>`;
    x += g.w * gw + GAP * gw;
  }
  return out;
}

/** 漢字の札の字（11/6 昼）。字形はオープンソースの日本語フォント（SIL Open Font License 1.1）の太字から取り出した塗りの path。
 * 1 文字は 1000 × 1000 の枠の中（y は上が 0） */
const KANJI: Record<string, string> = {
  "低": "M840 60 929 151Q858 173 773 192Q688 210 599 223Q510 236 427 244Q423 225 413 196Q403 168 393 150Q454 143 515 133Q577 124 636 112Q695 101 747 88Q799 75 840 60ZM362 119 479 157V719H362ZM297 696Q368 687 464 674Q561 660 659 645L665 752Q576 767 485 781Q394 795 320 807ZM432 368H969V476H432ZM632 173H753Q752 268 759 362Q765 456 777 538Q788 620 804 684Q819 747 837 783Q854 819 871 819Q882 819 888 786Q895 753 896 684Q915 702 941 720Q967 738 990 747Q982 823 966 865Q951 906 925 921Q899 936 859 936Q811 936 774 894Q738 851 711 776Q685 701 668 603Q651 506 642 396Q634 286 632 173ZM333 845H735V950H333ZM237 34 350 70Q318 154 274 240Q230 325 179 401Q128 478 73 535Q68 520 56 497Q45 473 32 449Q19 425 9 410Q54 364 97 304Q139 244 176 175Q212 106 237 34ZM141 311 255 197 255 198V968H141Z",
  "圧": "M190 82H939V198H190ZM275 439H894V552H275ZM207 827H959V940H207ZM119 82H241V370Q241 435 237 513Q233 591 221 673Q209 754 187 831Q165 908 129 970Q117 960 98 948Q78 935 57 925Q36 914 20 909Q55 851 75 782Q95 714 105 641Q114 569 117 500Q119 430 119 371ZM515 238H636V891H515Z",
  "停": "M326 119H963V220H326ZM578 32H698V167H578ZM504 336V391H777V336ZM391 257H897V470H391ZM302 508H976V701H866V599H407V702H302ZM441 641H838V736H441ZM578 664H697V853Q697 895 687 919Q676 943 645 955Q614 966 570 969Q527 971 470 971Q467 946 457 916Q448 886 436 862Q461 863 485 864Q510 865 530 864Q550 864 557 864Q569 864 574 861Q578 857 578 849ZM237 34 350 70Q318 154 274 240Q230 325 179 401Q128 478 73 535Q68 520 56 497Q45 473 32 449Q19 425 9 410Q54 364 97 304Q139 244 176 175Q212 106 237 34ZM141 311 255 197 255 198V968H141Z",
  "電": "M211 633H778V705H211ZM211 508H848V829H211V749H729V589H211ZM432 553H547V832Q547 860 561 867Q574 875 619 875Q628 875 646 875Q665 875 688 875Q712 875 735 875Q759 875 779 875Q799 875 810 875Q835 875 848 868Q861 861 867 839Q873 817 876 775Q894 787 924 798Q953 809 976 813Q969 873 953 906Q937 940 906 953Q874 967 819 967Q810 967 789 967Q767 967 741 967Q714 967 687 967Q660 967 639 967Q618 967 608 967Q540 967 502 955Q463 943 448 914Q432 885 432 833ZM151 508H266V874H151ZM128 66H870V155H128ZM205 306H403V371H205ZM186 405H403V471H186ZM593 405H813V471H593ZM593 306H789V371H593ZM438 102H556V481H438ZM59 192H942V397H831V272H166V397H59Z",
  "安": "M433 29H561V212H433ZM75 120H930V357H801V231H197V357H75ZM397 255 524 281Q495 342 463 407Q430 473 397 538Q364 603 332 661Q301 720 274 767L147 733Q176 687 208 628Q241 570 274 505Q308 441 340 377Q371 312 397 255ZM650 484 785 501Q753 617 696 698Q640 778 560 832Q481 886 377 919Q273 951 144 970Q139 955 127 935Q115 914 101 894Q88 874 76 861Q240 845 359 805Q477 765 550 688Q623 611 650 484ZM54 403H947V516H54ZM222 712 309 628Q382 648 464 676Q547 704 628 737Q710 769 782 803Q855 837 907 870L811 968Q764 936 695 901Q626 865 545 831Q464 796 381 765Q298 734 222 712Z",
  "全": "M496 144Q465 188 422 235Q379 281 327 327Q275 372 216 413Q158 454 96 488Q85 467 63 438Q40 410 20 392Q107 347 186 286Q265 224 328 156Q391 88 428 27H553Q593 84 643 137Q693 190 748 235Q804 281 864 318Q923 354 983 380Q960 403 940 431Q920 459 903 487Q846 455 787 415Q728 374 674 329Q620 283 574 236Q528 189 496 144ZM157 614H841V718H157ZM208 392H795V498H208ZM76 839H931V946H76ZM434 439H560V898H434Z",
  "確": "M549 516H923V604H549ZM549 674H923V762H549ZM547 833H970V931H547ZM400 124H965V306H858V224H501V306H400ZM684 432H794V880H684ZM586 350H945V449H586V970H473V454L575 350ZM638 29 752 51Q712 213 637 340Q562 467 452 548Q444 537 430 519Q415 502 399 485Q383 468 371 458Q473 391 540 280Q607 169 638 29ZM746 249 856 272Q837 313 818 351Q798 390 782 418L692 395Q706 364 722 323Q738 282 746 249ZM48 90H408V199H48ZM160 384H393V849H160V746H292V487H160ZM151 148 263 165Q249 273 225 377Q201 480 164 571Q128 661 78 729Q73 715 61 693Q50 671 37 649Q25 627 14 614Q53 559 80 485Q106 411 124 325Q141 239 151 148ZM113 384H210V927H113Z",
  "認": "M598 111H706Q699 171 685 232Q672 292 645 348Q618 403 574 452Q529 500 459 536Q450 515 430 490Q410 465 392 451Q452 422 490 383Q528 344 550 299Q572 254 582 206Q593 158 598 111ZM425 282 481 199Q531 213 584 235Q636 257 684 281Q731 305 764 326L707 419Q675 395 627 369Q580 344 528 320Q475 297 425 282ZM827 69H939Q939 69 939 78Q939 86 938 96Q938 107 937 113Q933 227 927 299Q921 372 913 412Q904 451 891 467Q876 486 861 494Q845 502 824 505Q806 509 777 509Q748 510 715 509Q714 484 706 453Q697 423 685 401Q711 404 732 404Q753 405 765 405Q784 406 795 393Q802 383 808 352Q814 320 819 256Q823 192 827 87ZM535 609H645V827Q645 848 649 854Q653 859 667 859Q670 859 677 859Q684 859 692 859Q700 859 707 859Q715 859 718 859Q728 859 733 852Q738 845 741 823Q744 800 745 754Q755 762 772 771Q790 779 809 786Q827 792 842 797Q837 862 825 898Q812 935 790 948Q767 962 731 962Q724 962 713 962Q701 962 689 962Q677 962 666 962Q655 962 648 962Q602 962 577 950Q553 937 544 908Q535 879 535 829ZM433 648 528 673Q524 717 515 762Q506 807 491 847Q476 886 451 916L363 863Q384 837 398 803Q412 768 420 728Q429 688 433 648ZM558 540 627 470Q659 486 693 508Q727 529 758 553Q788 576 807 597L732 675Q715 653 686 629Q658 605 624 582Q590 558 558 540ZM778 664 875 625Q902 663 924 707Q946 751 962 795Q978 838 985 873L879 917Q875 881 860 837Q845 794 824 748Q803 702 778 664ZM439 69H878V169H439ZM75 337H368V428H75ZM79 62H366V152H79ZM75 474H368V564H75ZM30 196H395V291H30ZM127 612H370V917H127V822H270V707H127ZM73 612H172V956H73Z",
};
/** 漢字の札の文字 */
export const KANJI_LABEL: Partial<Record<PropKind, string>> = { label_teiatsu: "低圧停電", label_anzen: "安全確認" };

/** 「1…2…3 SEC」の並び（字・点々・大きいすき間）。幅は字の幅の単位 */
const COUNT_PARTS = ["1", "dots", "2", "dots", "3", "space", "S", "E", "C"];
const DOTS_W = 1.3;
const SPACE_W = 0.5;
function countUnits(): number {
  return COUNT_PARTS.reduce((a, p, i) => a + (p === "dots" ? DOTS_W : p === "space" ? SPACE_W : GLYPH[p].w) + (i ? GAP : 0), 0);
}
function countGlyphs(x0: number, y0: number, gw: number, gh: number, sw: number): string {
  let x = x0;
  let out = "";
  COUNT_PARTS.forEach((p, i) => {
    if (i) x += GAP * gw;
    if (p === "dots") {
      for (const f of [0.2, 0.65, 1.1]) out += `<circle cx="${n(x + f * gw)}" cy="${n(y0 + gh * 0.92)}" r="${n(sw * 0.7)}" fill="${INK}"/>`;
      x += DOTS_W * gw;
    } else if (p === "space") x += SPACE_W * gw;
    else {
      out += glyphs(p, x, y0, gw, gh, sw);
      x += GLYPH[p].w * gw;
    }
  });
  return out;
}

/**
 * 行の数・✓ の数・丸数字・行の頭の絵を決めたチェック表（11/6 昼）。置き方は前の 3 行の絵と同じ（板の上の端は c − size/2、板の高さが size）。
 * 1 行は左から ✓ の欄・丸数字（numbered）・小さな絵（icons）・記入の線。丸数字と絵の分だけ板が左右に広がる
 */
function checklistRows([cx, cy]: Pt, s: number, W: number, list: NonNullable<Opt["list"]>): string {
  const h = s / 2;
  const rows = list.rows ?? 3;
  const checks = list.checks ?? Math.min(2, rows);
  const icons = list.icons ?? [];
  const hasIcon = icons.some((k) => k !== "none");
  const step = Math.min(0.48, 1.5 / rows) * h;
  const cs = Math.min(h * 0.26, step * 0.66);
  const numW = list.numbered ? cs * 1.5 : 0;
  const iconW = hasIcon ? step * 1.05 : 0;
  const bw = h * 1.44 + numW + iconW;
  const x0 = cx - bw / 2;
  const y0 = cy - h;
  const rbox = (a: number, t: number, b: number, u: number, fill: string, r: number, k: number) =>
    `<rect x="${n(a)}" y="${n(t)}" width="${n(b - a)}" height="${n(u - t)}" rx="${n(r)}" fill="${fill}" stroke="${INK}" stroke-width="${n(W * k)}" stroke-linejoin="round"/>`;
  let out = rbox(x0, y0, x0 + bw, y0 + s, STEEL, s * 0.06, 1) + rbox(x0 + h * 0.12, y0 + h * 0.16, x0 + bw - h * 0.12, y0 + s - h * 0.1, PAPER, s * 0.02, 0.6) +
    rbox(cx - h * 0.3, y0 - h * 0.12, cx + h * 0.3, y0 + h * 0.14, DEEP, s * 0.03, 0.8);
  const first = y0 + h * 0.31 + step / 2;
  for (let k = 0; k < rows; k++) {
    const ry = first + k * step;
    const bx = x0 + h * 0.26;
    let x = bx + cs * 1.3;
    out += rbox(bx, ry - cs / 2, bx + cs, ry + cs / 2, PAPER, cs * 0.15, 0.5);
    if (k < checks)
      out += `<polyline points="${n(bx + cs * 0.15)},${n(ry)} ${n(bx + cs * 0.45)},${n(ry + cs * 0.38)} ${n(bx + cs * 1.2)},${n(ry - cs * 0.75)}" fill="none" stroke="${INK}" stroke-width="${n(Math.max(W * 0.9, cs * 0.16))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (list.numbered) {
      // 丸数字: 細い輪と、中の数字（線で描く）
      const r = cs * 0.6;
      const mx = x + cs * 0.15 + r;
      const digit = String(k + 1);
      const gh = r * 1.0;
      const gw = gh * 0.62;
      const dw = glyphsWidth(digit, gw);
      out += `<circle cx="${n(mx)}" cy="${n(ry)}" r="${n(r)}" fill="none" stroke="${INK}" stroke-width="${n(Math.max(1, cs * 0.09))}"/>` +
        glyphs(digit, mx - dw / 2, ry - gh / 2, gw, gh, Math.max(1, cs * 0.11));
      x += numW;
    }
    if (hasIcon) {
      const ik = icons[k] ?? "none";
      const z = step * 0.9;
      const ix = x + iconW / 2;
      if (ik === "fall") out += fallIcon(ix, ry, z, W);
      else if (ik !== "none") out += shape(ik, [ix, ry + (ON_FLOOR.has(ik) ? z * 0.45 : 0)], z, 1, { W: W * 0.6, icon: true });
      x += iconW;
    }
    out += `<line x1="${n(x + cs * 0.1)}" y1="${n(ry)}" x2="${n(x0 + bw - h * 0.28)}" y2="${n(ry)}" stroke="${MID}" stroke-width="${n(W * 0.7)}" stroke-linecap="round"/>`;
  }
  return out;
}

/** 転倒の小さな絵（11/6 昼。チェック表の行の頭）: 床の段差につまずき、前へ倒れかける人（頭・体・手足の太い線）と、後ろの動きの線 2 本。(cx, cy) が真ん中、z は枠の大きさ */
function fallIcon(cx: number, cy: number, z: number, W: number): string {
  const P = (u: number, v: number) => `${n(cx + u * z)} ${n(cy + v * z)}`;
  const t = Math.max(W * 0.9, z * 0.1);
  const limb = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n(t)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const thin = (u1: number, v1: number, u2: number, v2: number) => `<path d="M${P(u1, v1)}L${P(u2, v2)}" fill="none" stroke="${INK}" stroke-width="${n(t * 0.45)}" stroke-linecap="round"/>`;
  return thin(-0.5, 0.45, 0.5, 0.45) +
    `<rect x="${n(cx + z * 0.02)}" y="${n(cy + z * 0.3)}" width="${n(z * 0.2)}" height="${n(z * 0.15)}" fill="${DARK}" stroke="${INK}" stroke-width="${n(t * 0.35)}"/>` +
    limb(`M${P(-0.14, 0.06)}L${P(0.16, -0.14)}`) +
    limb(`M${P(-0.14, 0.06)}L${P(-0.06, 0.24)}L${P(0.0, 0.34)}`) +
    limb(`M${P(-0.14, 0.06)}L${P(-0.32, 0.18)}L${P(-0.44, 0.08)}`) +
    limb(`M${P(0.16, -0.14)}L${P(0.32, 0.0)}L${P(0.4, 0.12)}`) +
    limb(`M${P(0.16, -0.14)}L${P(0.1, -0.32)}L${P(0.2, -0.44)}`) +
    `<circle cx="${n(cx + z * 0.32)}" cy="${n(cy - z * 0.24)}" r="${n(z * 0.1)}" fill="${INK}"/>` +
    thin(-0.3, -0.22, -0.4, -0.17) + thin(-0.4, -0.08, -0.5, -0.03);
}

/** かぶり物と保護めがねは頭に付けたとき、手袋は手に付けたとき、size ではなく頭・手の大きさに合わせる */
const HEADWEAR = new Set<PropKind>(["helmet", "helmet_new", "cap_lead", "goggles", "dust_mask"]);
const HANDWEAR = new Set<PropKind>(["gloves", "cut_gloves", "insulated_gloves", "wristband"]);

/**
 * 吹き出し。c は箱の真ん中（キャンバスの中に収める）、to はしっぽの向かう先（人の頭。無ければ真下）。
 * 話す: 実線の箱としっぽ / 考える: 点線の箱と、頭へ向かって小さくなる丸 2 つ。
 * 中は、道具があれば左に道具・右に「？」か「✓」、無ければ「？」か「✓」だけ。白は data-part="bubble" の中だけ
 */
/** 吹き出しの中の印 1 つ（？・○・×）。(mx, my) が真ん中、ms が大きさ */
function innerMarkSvg(m: InnerMark, mx: number, my: number, ms: number): string {
  const q = ms * 0.5;
  if (m === "question") {
    const qy = my - q * 0.35;
    return `<path d="M${n(mx - q * 0.42)} ${n(qy - q * 0.2)}A${n(q * 0.42)} ${n(q * 0.42)} 0 1 1 ${n(mx + q * 0.1)} ${n(qy + q * 0.22)}Q${n(mx)} ${n(qy + q * 0.32)} ${n(mx)} ${n(qy + q * 0.62)}" fill="none" stroke="${INK}" stroke-width="${n(q * 0.24)}" stroke-linecap="round"/>` +
      `<circle cx="${n(mx)}" cy="${n(qy + q * 1.02)}" r="${n(q * 0.15)}" fill="${INK}"/>`;
  }
  if (m === "circle") return `<circle cx="${n(mx)}" cy="${n(my)}" r="${n(q * 0.72)}" fill="none" stroke="${INK}" stroke-width="${n(q * 0.26)}"/>`;
  if (m === "cross") {
    const a = q * 0.62;
    return `<path d="M${n(mx - a)} ${n(my - a)}L${n(mx + a)} ${n(my + a)}M${n(mx + a)} ${n(my - a)}L${n(mx - a)} ${n(my + a)}" fill="none" stroke="${INK}" stroke-width="${n(q * 0.26)}" stroke-linecap="round"/>`;
  }
  return "";
}

function bubbleSvg(kind: PropKind, [cx0, cy0]: Pt, s: number, to: Pt | null, inner: InnerKind | undefined, size: number, inner2?: InnerKind, marks?: [InnerMark, InnerMark]): string {
  const think = kind.startsWith("think");
  const check = kind.endsWith("check");
  // 道具が 2 つのときは横に 1.25 倍の幅にする（道具 2 つと印 2 つが入る）
  const two = inner !== undefined && inner2 !== undefined;
  const bw = two ? s * 1.25 : s;
  const bh = s * 0.6;
  // 縁は人や小物と同じ太さ（大きさでは変えない）
  const w = lineWidth(size);
  const cx = Math.max(bw / 2 + w, Math.min(size - bw / 2 - w, cx0));
  const cy = Math.max(bh / 2 + w, Math.min(size - bh / 2 - w, cy0));
  const target: Pt = to ?? [cx, cy + bh];
  const box = `<rect x="${n(cx - bw / 2)}" y="${n(cy - bh / 2)}" width="${n(bw)}" height="${n(bh)}" rx="${n(bh * (think ? 0.5 : 0.25))}" fill="#fff" stroke="${INK}" stroke-width="${n(w)}"${think ? ` stroke-dasharray="${n(w * 2.2)} ${n(w * 1.6)}"` : ""}/>`;
  // 箱の縁から先へ向かう向き
  const vx = target[0] - cx;
  const vy = target[1] - cy;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const tEdge = Math.min(Math.abs((bw / 2) / (ux || 1e-9)), Math.abs((bh / 2) / (uy || 1e-9)));
  const edge: Pt = [cx + ux * tEdge, cy + uy * tEdge];
  const room = Math.max(0, len - tEdge - s * 0.06);
  let tail = "";
  if (think) {
    // 考える: 小さい丸 2 つ
    const r1 = s * 0.055;
    const r2 = s * 0.035;
    const d1 = Math.min(room * 0.35, s * 0.12) + r1;
    const d2 = Math.min(room * 0.75, s * 0.26) + r2;
    tail = [[d1, r1], [d2, r2]].map(([dd, r]) => `<circle cx="${n(edge[0] + ux * dd)}" cy="${n(edge[1] + uy * dd)}" r="${n(r)}" fill="#fff" stroke="${INK}" stroke-width="${n(w * 0.8)}"/>`).join("");
  } else {
    // 話す: 縁から先へ向かう三角のしっぽ。付け根は箱の中に少し入れ、縁の線を白で隠す
    const tl = Math.min(room * 0.7, s * 0.22);
    const px = -uy * s * 0.07;
    const py = ux * s * 0.07;
    const base: Pt = [edge[0] - ux * w * 1.5, edge[1] - uy * w * 1.5];
    const tip: Pt = [edge[0] + ux * tl, edge[1] + uy * tl];
    tail = `<polygon points="${n(base[0] + px)},${n(base[1] + py)} ${n(base[0] - px)},${n(base[1] - py)} ${n(tip[0])},${n(tip[1])}" fill="#fff" stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"/>` +
      `<line x1="${n(base[0] + px * 0.8)}" y1="${n(base[1] + py * 0.8)}" x2="${n(base[0] - px * 0.8)}" y2="${n(base[1] - py * 0.8)}" stroke="#fff" stroke-width="${n(w * 2.2)}"/>`;
  }
  // 中身。記号の無い話す吹き出し（bubble_say）は道具だけを真ん中に、「！」の吹き出し（bubble_alert）は道具の右に「！」
  const say = kind === "bubble_say";
  const alert = kind === "bubble_alert";
  const mx = inner && !say ? cx + bw * 0.24 : cx;
  const ms = bh * 0.62;
  let mark: string;
  if (say) {
    mark = "";
  } else if (alert) {
    // 「！」を太い線と点で描く
    const q = ms * 0.5;
    mark = `<line x1="${n(mx)}" y1="${n(cy - q * 0.85)}" x2="${n(mx)}" y2="${n(cy + q * 0.3)}" stroke="${INK}" stroke-width="${n(q * 0.3)}" stroke-linecap="round"/>` +
      `<circle cx="${n(mx)}" cy="${n(cy + q * 0.8)}" r="${n(q * 0.17)}" fill="${INK}"/>`;
  } else if (check) {
    mark = `<circle cx="${n(mx)}" cy="${n(cy)}" r="${n(ms * 0.5)}" fill="${INK}"/>` +
      `<polyline points="${n(mx - ms * 0.24)},${n(cy + ms * 0.01)} ${n(mx - ms * 0.06)},${n(cy + ms * 0.19)} ${n(mx + ms * 0.26)},${n(cy - ms * 0.18)}" fill="none" stroke="#fff" stroke-width="${n(ms * 0.11)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else {
    // 「？」を線と点で描く（014: 絵の面に文字を置かない）
    const q = ms * 0.5;
    const qy = cy - q * 0.35;
    mark = `<path d="M${n(mx - q * 0.42)} ${n(qy - q * 0.2)}A${n(q * 0.42)} ${n(q * 0.42)} 0 1 1 ${n(mx + q * 0.1)} ${n(qy + q * 0.22)}Q${n(mx)} ${n(qy + q * 0.32)} ${n(mx)} ${n(qy + q * 0.62)}" fill="none" stroke="${INK}" stroke-width="${n(q * 0.24)}" stroke-linecap="round"/>` +
      `<circle cx="${n(mx)}" cy="${n(qy + q * 1.02)}" r="${n(q * 0.15)}" fill="${INK}"/>`;
  }
  // 中の道具は細い縁で描き、床に置く道具は箱の真ん中に来るよう下へずらす
  const is = bh * 0.62;
  const iconAt = (k: InnerKind, x: number, sz: number) => shape(k, [x, cy + (ON_FLOOR.has(k) ? sz * 0.45 : 0)], sz, 1, { W: w * 0.7, icon: true });
  if (two) {
    // 2 つの道具: 左右の半分の真ん中より少し左に道具、右上に印。吹き出しの種類の印は描かない
    const sz = bh * 0.56;
    const [m1, m2] = marks ?? ["none", "none"];
    const half = (k: InnerKind, m: InnerMark, xc: number) => {
      const hasMark = m !== "none";
      const x = hasMark ? xc - bw * 0.05 : xc;
      return iconAt(k, x, sz) + (hasMark ? innerMarkSvg(m, xc + bw * 0.11, cy - bh * 0.2, bh * 0.36) : "");
    };
    return `<g data-part="bubble">${tail}${box}${half(inner!, m1, cx - bw * 0.25)}${half(inner2!, m2, cx + bw * 0.25)}</g>`;
  }
  // 「1…2…3 SEC」は横に長いので、記号の無い吹き出しでは箱の幅いっぱいに、ほかの吹き出しでは印の左の幅に収める（11/6 昼）
  if (inner === "count_3sec") {
    const sz = say ? Math.min(is, (bw * 0.86) / 2.3) : (bw * 0.48) / 2.3;
    return `<g data-part="bubble">${tail}${box}${iconAt(inner, say ? cx : cx - bw * 0.21, sz)}${mark}</g>`;
  }
  const icon = inner ? iconAt(inner, say ? cx : cx - bw * 0.18, is) : "";
  return `<g data-part="bubble">${tail}${box}${icon}${mark}</g>`;
}

export function propsSvg(props: PropSpec[], posed: Posed[], size: number): string {
  const W = lineWidth(size);
  // クレーンと吊り荷をつなぐ（11/5）: 吊り荷がクレーンの先の近く（横に吊り荷の大きさの 0.8 倍まで）で先より下にあれば、
  // 吊り荷を先の真下へ寄せ、ワイヤーを先から垂らす。クレーンは自分のワイヤーとフックを描かない
  const tips = props.map((p) => (p.kind === "crane" ? (() => { const a = anchorPoint(p.at, posed, size); return craneTip(a.c, p.size * size, a.d); })() : null));
  const link = new Map<number, number>(); // 吊り荷の番号 → クレーンの番号
  props.forEach((p, i) => {
    if (p.kind !== "suspended_load") return;
    const { c } = anchorPoint(p.at, posed, size);
    const j = tips.findIndex((t) => t !== null && Math.abs(t[0] - c[0]) <= p.size * size * 0.8 && t[1] < c[1]);
    if (j >= 0) link.set(i, j);
  });
  const linkedCranes = new Set(link.values());
  return props
    .map((p, i) => {
      const a = anchorPoint(p.at, posed, size);
      const d = a.d;
      const j = link.get(i);
      const c: Pt = j === undefined ? a.c : [tips[j]![0], a.c[1]];
      if (BUBBLES.has(p.kind)) {
        let to: Pt | null = null;
        if ("figure" in p.at) {
          const f = posed[p.at.figure];
          to = [f.joints.head[0], f.joints.head[1] - f.h * PROPORTION.head * 0.6];
        }
        return `<g data-part="prop">${bubbleSvg(p.kind, c, p.size * size, to, p.inner, size, p.inner2, p.inner_marks)}</g>`;
      }
      const onHead = HEADWEAR.has(p.kind) && "figure" in p.at && p.at.joint === "head";
      const onHand = HANDWEAR.has(p.kind) && "figure" in p.at && p.at.joint.startsWith("hand");
      const s = onHead ? posed[(p.at as { figure: number }).figure].h * PROPORTION.head * 2.5
        : onHand ? posed[(p.at as { figure: number }).figure].h * PROPORTION.hand * 3.6
        : p.size * size;
      if (p.kind === "anchor_line") return `<g data-part="prop">${anchorLine(c, s, d, size, W)}</g>`;
      // 人の腰に付けた椅子（11/6）: 床に置き、座面の上の面がお尻の下（腰の関節から背の高さ × 0.03 下）に合う大きさにする。
      // 背もたれが背中のすぐ後ろ（腰から背の高さ × 0.13 後ろ）に立ち、体に隠れずに見えるよう、椅子を後ろへずらす
      if (p.kind === "chair" && "figure" in p.at) {
        const f = posed[p.at.figure];
        const seatY = c[1] + f.h * 0.03;
        const sc = Math.max(f.h * 0.1, (FLOOR_Y * size - seatY) / (SEAT_TOP.chair ?? 0.46));
        return `<g data-part="prop">${shape("chair", [c[0] - d * (f.h * 0.13 - sc * 0.22), FLOOR_Y * size], sc, d, { W })}</g>`;
      }
      // 人に付けた安全帯は、腰のベルトに加えて肩のベルトともものベルトを体に沿って描く（058）
      const onBody = "figure" in p.at;
      const straps = p.kind === "harness" && onBody ? harnessStraps(posed[(p.at as { figure: number }).figure], W) : "";
      const elbow = onHand ? posed[(p.at as { figure: number }).figure].joints[(p.at as { joint: Joint }).joint.replace("hand", "elbow") as Joint] : undefined;
      // キャンバスに置いた電球は天井の線から吊る
      const hung = (p.kind === "bulb_flicker" || p.kind === "bulb_steady" || p.kind === "bulb_off") && !onBody ? CEIL * size : undefined;
      const opt: Opt = { W, worn: onHead || onHand, body: onBody, elbow, linked: linkedCranes.has(i), topY: j === undefined ? hung : tips[j]![1] };
      // チェック表の欄（11/6）。どれも無ければ前の絵のまま
      if (p.kind === "checklist" && (p.rows !== undefined || p.checks !== undefined || p.numbered !== undefined || p.icons !== undefined))
        opt.list = { rows: p.rows, checks: p.checks, numbered: p.numbered, icons: p.icons };
      return `<g data-part="prop">${straps}${shape(p.kind, c, s, d, opt)}</g>`;
    })
    .join("");
}

/** 吊り元の綱: 腰の後ろから天井の金具までの灰の綱と、天井にかけたフックと金具の板。c は腰 */
function anchorLine([cx, cy]: Pt, s: number, d: number, size: number, W: number): string {
  const top = CEIL * size;
  const bx = cx - d * s * 0.45;
  const tx = cx - d * s * 0.7;
  const hookY = top + s * 0.45;
  const rope = `M${n(bx)} ${n(cy)}Q${n(tx - d * s * 0.25)} ${n((cy + hookY) / 2)} ${n(tx)} ${n(hookY)}`;
  return `<path d="${rope}" fill="none" stroke="${INK}" stroke-width="${n(W * 2.6)}" stroke-linecap="round"/><path d="${rope}" fill="none" stroke="${MID}" stroke-width="${n(W)}" stroke-linecap="round"/>` +
    `<path d="M${n(tx)} ${n(hookY)}V${n(top + s * 0.2)}A${n(s * 0.12)} ${n(s * 0.12)} 0 0 ${d > 0 ? 1 : 0} ${n(tx + d * s * 0.24)} ${n(top + s * 0.2)}V${n(top + s * 0.3)}" fill="none" stroke="${INK}" stroke-width="${n(W * 1.6)}" stroke-linecap="round"/>` +
    `<rect x="${n(tx - s * 0.2)}" y="${n(top)}" width="${n(s * 0.64)}" height="${n(s * 0.12)}" rx="${n(s * 0.03)}" fill="${STEEL}" stroke="${INK}" stroke-width="${n(W)}" stroke-linejoin="round"/>`;
}

/** 安全帯の肩とももをつなぐベルト（フルハーネス）。肩から腰へ 2 本、胸に横の 1 本、ももに 1 本ずつ。縁の黒の上に濃い灰を重ねる */
function harnessStraps(p: Posed, W: number): string {
  const j = p.joints;
  const tw = p.h * PROPORTION.torsoWidth * 0.32;
  const strap = (a: Pt, b: Pt) =>
    `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${INK}" stroke-width="${n(W * 3)}" stroke-linecap="round"/>` +
    `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${DARK}" stroke-width="${n(W * 1.4)}" stroke-linecap="round"/>`;
  const at = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  let out = "";
  for (const k of [-1, 1]) out += strap([j.shoulder[0] + k * tw, j.shoulder[1]], [j.hip[0] + k * tw, j.hip[1]]);
  const chest = at(j.shoulder, j.hip, 0.3);
  out += strap([chest[0] - tw * 1.3, chest[1]], [chest[0] + tw * 1.3, chest[1]]);
  const lw = p.h * PROPORTION.limbWidth * 0.75;
  for (const knee of [j.knee_far, j.knee_near]) {
    const m = at(j.hip, knee, 0.35);
    const vx = knee[0] - j.hip[0];
    const vy = knee[1] - j.hip[1];
    const len = Math.hypot(vx, vy) || 1;
    const [px, py] = [-vy / len, vx / len];
    out += strap([m[0] + px * lw, m[1] + py * lw], [m[0] - px * lw, m[1] - py * lw]);
  }
  return out;
}
