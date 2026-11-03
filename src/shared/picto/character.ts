// 人の新しい絵柄（11/3 に作者が「正」とした手元の試しの絵）を、骨格の角度（skeleton.ts の 10 か所と範囲）で描く試し。
// 長さと太さは新しい絵柄のまま（胴 142・もも 85・すね 77・上腕 70・前腕 52、単位は背の高さ 434 の中の値）、
// 角度の決まり（真下が 0、前へ正。腕は胴に対して、足は腰に対して）は posePoints と同じ。
// 関節ごとに g を入れ子にして回すので、どんな角度でも手足と靴が体から外れない。
import type { Angles } from "./poses";

export type View = "quarter" | "side";
export type CharacterRole = "new" | "lead" | "worker";
/** 絵柄の道。a は 11/3 に仮に決めた丸頭とかぶり物、b は作者の手描きのスケッチ（髪・まつ毛の目・点の鼻）から起こした別の道 */
export type Look = "a" | "b";
export type Hair = "bob" | "short" | "bun";

export interface CharacterSpec {
  angles: Angles;
  /** 腰の横の位置（px） */
  x: number;
  /** 地面の高さ（px） */
  groundY: number;
  /** 背の高さ（px。ヘルメットの上から靴底まで） */
  height: number;
  facing: "left" | "right";
  view?: View;
  role?: CharacterRole;
  look?: Look;
  /** b の髪形 */
  hair?: Hair;
  /** b でかぶり物を載せるか（a はいつも載せる） */
  hat?: boolean;
}

const UNIT = 434;
export const L = { torso: 142, shoulderDrop: 22, upperArm: 70, lowerArm: 52, thigh: 85, shin: 77, sole: 25, headUp: 2 };
const HAT: Record<CharacterRole, string> = { new: "#fff", lead: "#222", worker: "#999" };

/** 部位の置き場所（左右）。斜めは腕と足を胴の左右へ、真横は前後に重ねる */
export const SPOT: Record<View, { arm: [number, number]; leg: [number, number] }> = {
  quarter: { arm: [-42, 42], leg: [-18, 18] },
  side: { arm: [-6, 4], leg: [-8, 6] },
};

const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
/** 手足の 1 段（0,0 から真下へ len）。縁の回は黒で太く、中身の回は灰色で 12 細く描く */
type Pass = "edge" | "fill";
const seg = (len: number, w: number, pass: Pass, fill = "#666") =>
  pass === "edge"
    ? `<path d="M0 0V${len}" stroke="#000" stroke-width="${w}" stroke-linecap="round"/>`
    : `<path d="M0 0V${len}" stroke="${fill}" stroke-width="${w - 12}" stroke-linecap="round"/>`;

/** 絵柄ごとの服の色（腕＝袖、足＝ズボン、手、胴、ベスト） */
const CLOTH: Record<Look, { arm: string; leg: string; hand: string; shirt: string; vest: string }> = {
  a: { arm: "#666", leg: "#666", hand: "#ccc", shirt: "#666", vest: "#999" },
  b: { arm: "#fff", leg: "#555", hand: "#fff", shirt: "#fff", vest: "#ccc" },
};
const rot = (deg: number) => (deg ? ` rotate(${n(deg)})` : "");

/**
 * 靴（原点＝足首、すねの向きの座標で描く）。
 * 靴の口（足を入れる上の辺）はすねに直角のまま、すねと一緒に傾く。かかと・靴底・つま先は床と平行に置く（ankle だけ回した向き）。
 * 2 つの向きの点を 1 つの形でつなぐので、すねが傾いても口が足からずれず、靴底は床に乗る。
 * ankle は靴底を床と平行に戻す回転（度）。靴底の下端は足首から 25 下
 */
export function shoe(ankle: number): string {
  const r = (ankle * Math.PI) / 180;
  const f = (x: number, y: number) => `${n(x * Math.cos(r) - y * Math.sin(r))} ${n(x * Math.sin(r) + y * Math.cos(r))}`;
  const body =
    `M-18 -8L${f(-22, 16)}Q${f(-22, 25)} ${f(-13, 25)}L${f(30, 25)}Q${f(38, 25)} ${f(38, 17)}Q${f(38, 10)} ${f(30, 9)}L${f(16, -2)}Q15 -5 14 -8Z`;
  return `<path d="${body}" fill="#222" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="M${f(-20, 25)}L${f(38, 25)}" stroke="#000" stroke-width="6" stroke-linecap="round"/>`;
}

/** 胴（原点＝腰。斜めはふつうの幅、真横は細く、ベストの V を前寄りに） */
export const torso = (view: View, look: Look) => {
  const c = CLOTH[look];
  return view === "quarter"
    ? `<rect x="-46" y="-142" width="92" height="162" rx="30" fill="${c.shirt}" stroke="#000" stroke-width="6"/>` +
        `<path d="M-46 -110Q-46 -142 -20 -142L0 -100L20 -142Q46 -142 46 -110V18H-46Z" fill="${c.vest}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
        `<path d="M-43 -40H43" stroke="#333" stroke-width="12"/>`
    : `<rect x="-30" y="-142" width="60" height="162" rx="20" fill="${c.shirt}" stroke="#000" stroke-width="6"/>` +
        `<path d="M-30 -110Q-30 -142 -8 -142L10 -100L28 -142Q30 -142 30 -110V18H-30Z" fill="${c.vest}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
        `<path d="M-27 -40H27" stroke="#333" stroke-width="12"/>`;
};

/** 頭（原点＝首の付け根。目は半径 6、真横は目 1 つで鼻なし）とかぶり物（つばは前だけ） */
const HEAD: Record<View, string> = {
  quarter:
    `<circle cy="-45" r="45" fill="#ccc" stroke="#000" stroke-width="6"/><circle cx="6" cy="-38" r="6"/><circle cx="30" cy="-38" r="6"/>` +
    `<path d="M10 -19Q20 -11 30 -19" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  side:
    `<circle cy="-45" r="45" fill="#ccc" stroke="#000" stroke-width="6"/><circle cx="24" cy="-38" r="6"/>` +
    `<path d="M28 -20Q36 -14 42 -24" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`,
};
/**
 * b の顔（原点＝首の付け根、顔は 0,-45 を中心にした角の丸い白い四角）。
 * 目は縦長の小さな楕円に、外側の上へ短いまつ毛を 1 本。鼻は小さな点。口は笑顔と真顔の間のゆるい線。
 * 線はスケッチのペンに寄せて、体より少し細い 4.5
 */
const eyeB = (cx: number, out: number) =>
  `<ellipse cx="${cx}" cy="-37" rx="4.3" ry="5.6"/>` +
  `<path d="M${cx + out * 2.8} -41l${out * 3.6} -1.6M${cx + out * 0.8} -42.4l${out * 1.4} -3.6" stroke="#000" stroke-width="2.2" stroke-linecap="round"/>`;
/** 顔の形: 丸ではなく、四角に寄せて角を大きく取る（幅 90・高さ 90、角の半径 26） */
export const FACE_SHAPE = `<rect x="-45" y="-90" width="90" height="90" rx="26" fill="#fff" stroke="#000" stroke-width="4.5"/>`;
const FACE_B: Record<View, string> = {
  quarter:
    `${FACE_SHAPE}${eyeB(8, -1)}${eyeB(30, 1)}` +
    `<circle cx="21" cy="-25" r="2.6"/><path d="M14 -15Q20 -13 26 -15" stroke="#000" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  side:
    `${FACE_SHAPE}${eyeB(27, 1)}` +
    `<circle cx="37" cy="-27" r="2.6"/><path d="M29 -15Q33 -13.5 37 -15" stroke="#000" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
};
/**
 * b の髪（顔の丸の上に重ねる黒い形。内側の縁が生え際になる）。back は顔より後ろに描く分（お団子）。
 * おかっぱ（bob）はスケッチどおり、後ろ側を長く厚く、前側は短く外へはねる。前髪は後ろの上から前の目の上へ斜めに流す
 */
const HAIR_B: Record<Hair, Record<View, { back?: string; front: string }>> = {
  bob: {
    quarter: {
      front: "M58 -22Q51 -30 52 -56C54 -100 22 -108 -6 -106C-50 -104 -66 -78 -64 -44C-63 -16 -56 2 -42 6Q-30 8 -28 -4Q-34 -24 -32 -46C-24 -58 4 -66 24 -72Q34 -74 40 -64Q42 -46 43 -34Q47 -24 58 -22Z",
    },
    side: {
      front: "M44 -60C50 -96 22 -108 -8 -106C-50 -104 -66 -76 -64 -44C-63 -16 -54 2 -40 6Q-26 8 -22 -4Q-14 -24 -10 -44C-2 -62 22 -70 44 -60Z",
    },
  },
  short: {
    quarter: { front: "M47 -57C49 -96 16 -104 -10 -102C-44 -98 -54 -74 -50 -44Q-48 -32 -40 -27Q-37 -44 -30 -53C-16 -68 16 -72 34 -64Q41 -61 47 -57Z" },
    side: { front: "M46 -60C46 -94 18 -104 -10 -102C-44 -98 -54 -74 -50 -44Q-46 -30 -34 -26Q-30 -44 -20 -54C-4 -68 24 -70 46 -60Z" },
  },
  bun: {
    quarter: {
      back: `<circle cx="-36" cy="-94" r="17" fill="#111" stroke="#000" stroke-width="4.5"/>`,
      front: "M48 -55C50 -96 16 -104 -10 -102C-46 -98 -58 -72 -54 -40Q-50 -22 -40 -18Q-36 -40 -30 -52C-16 -70 16 -72 36 -62Q43 -59 48 -55Z",
    },
    side: {
      back: `<circle cx="-40" cy="-90" r="17" fill="#111" stroke="#000" stroke-width="4.5"/>`,
      front: "M46 -58C46 -94 18 -104 -10 -102C-46 -98 -58 -72 -54 -40Q-48 -20 -36 -18Q-30 -40 -20 -54C-4 -70 24 -70 46 -58Z",
    },
  },
};
const headB = (view: View, hair: Hair, hatFill?: string) => {
  const h = HAIR_B[hair][view];
  return `${h.back ?? ""}${NECK_B}${FACE_B[view]}<path d="${h.front}" fill="#111" stroke="#000" stroke-width="4.5" stroke-linejoin="round"/>${hatFill ? hat(hatFill) : ""}`;
};

const hat = (fill: string) => `<path d="M-50 -52Q-52 -104 0 -104Q44 -104 50 -62H88V-50H-50Z" fill="${fill}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>`;

const ANKLE_MAX = 25;

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const R = (deg: number): M => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};
const at = (m: M, x: number, y: number) => m[1] * x + m[3] * y + m[5];

/**
 * 角度の決まりを、SVG の回転（時計回りが正）に直す。右向きのとき:
 * 胴は前へ倒すと時計回り（+torso）、首も同じ。下へ垂れる手足は前へ振ると反時計回り（−角度）。
 * 腕は胴の g の中に入れるので、胴の傾きは自動で足される（skeleton.ts の「腕の世界の角度＝腕−胴」と同じ）。
 * 靴は、ももとすねの回転を打ち消して、いつも床と平行にする。
 */
function rig(a: Angles) {
  const legs = (["far", "near"] as const).map((s) => {
    const thigh = -a[`leg_${s}_upper`];
    const shin = -a[`leg_${s}_lower`];
    // 靴底を床と平行に戻す回転。戻しすぎると靴の口と靴底の向きの差で靴の形がねじれるので ±25° までにし、残りは靴ごと傾ける（しゃがむとかかとが上がる）
    return { s, thigh, shin, ankle: Math.max(-ANKLE_MAX, Math.min(ANKLE_MAX, -(thigh + shin))) };
  });
  const arms = (["far", "near"] as const).map((s) => ({ s, upper: -a[`arm_${s}_upper`], lower: -a[`arm_${s}_lower`] }));
  return { torso: a.torso, neck: a.neck, legs, arms };
}

/**
 * 斜めの絵の腕の置き場所。腕は胴の左右に付くので、前の置き場所の腕を後ろへ振ると胴を横切る。
 * そこで、前へ大きく振っている腕を前の置き場所（胴の上に描く）、もう一方を奥の置き場所にする。
 * 返すのは [奥に描く腕, 前に描く腕] の番号（0 が far、1 が near）
 */
function armOrder(a: Angles, view: View): [number, number] {
  return view === "quarter" && a.arm_far_upper > a.arm_near_upper ? [1, 0] : [0, 1];
}

/** 首は頭の下の方（首の付け根から 30 上）を軸に回し、うつむくほど少し前へ出す。胴の上の端で回すと頭が胴の前へずれる */
const NECK_PIVOT = 30;
/** b は頭を少し持ち上げて、あごと胴の間に短い首を見せる（a は首なし） */
export const NECK_LEN: Record<Look, number> = { a: 0, b: 14 };
export const NECK_B = `<rect x="-11" y="-6" width="22" height="${NECK_LEN.b + 14}" fill="#fff" stroke="#000" stroke-width="4.5"/>`;
const neckShift = (deg: number) => Math.sin((deg * Math.PI) / 180) * 10;

/** いちばん低い点（靴底・ひざ・手・頭）の腰からの高さ。地面に置くのに使う */
function lowest(a: Angles, view: View, look: Look): number {
  const r = rig(a);
  const ys: number[] = [];
  r.legs.forEach((g, i) => {
    const hip = T(SPOT[view].leg[i], 0);
    const knee = mul(mul(hip, R(g.thigh)), T(0, L.thigh));
    const ankle = mul(mul(knee, R(g.shin)), T(0, L.shin));
    const foot = mul(ankle, R(g.ankle));
    ys.push(at(knee, 0, 20), ...[-22, 38].map((x) => at(foot, x, L.sole)));
  });
  const torso = R(r.torso);
  armOrder(a, view).forEach((idx, spot) => {
    const g = r.arms[idx];
    const sh = mul(mul(torso, T(SPOT[view].arm[spot], -142 + L.shoulderDrop)), R(g.upper));
    const hand = mul(mul(mul(sh, T(0, L.upperArm)), R(g.lower)), T(0, L.lowerArm));
    ys.push(at(hand, 0, 15));
  });
  const head = mul(mul(mul(torso, T(neckShift(r.neck), -142 - L.headUp - NECK_LEN[look] - NECK_PIVOT)), R(r.neck)), T(0, NECK_PIVOT));
  ys.push(at(head, 0, 0), at(head, 0, -104));
  return Math.max(...ys);
}

/** 人 1 人の SVG（g 1 つ） */
export function characterSvg(c: CharacterSpec): string {
  const view = c.view ?? "quarter";
  const r = rig(c.angles);
  const look = c.look ?? "a";
  const cloth = CLOTH[look];
  const k = c.height / UNIT;
  const d = c.facing === "right" ? 1 : -1;
  const low = lowest(c.angles, view, c.look ?? "a");
  // 手足は 1 本ごとに 2 回描く: まず全部の段の縁（黒）、次に全部の段の中身（灰色）。
  // 段ごとに縁と中身を描くと、下の段の縁が上の段の中身に重なって関節の線（ロボットのような区切り）が出る。
  // 2 回に分けると、ひじ・ひざの内側の縁は中身に埋もれて消え、外まわりの縁だけが 1 本につながる
  const leg = (i: number) => {
    const g = r.legs[i];
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].leg[i]} 0)${rot(g.thigh)}">${seg(L.thigh, 40, pass, cloth.leg)}<g transform="translate(0 ${L.thigh})${rot(g.shin)}">${seg(L.shin, 40, pass, cloth.leg)}${pass === "fill" ? `<g transform="translate(0 ${L.shin})">${shoe(g.ankle)}</g>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  const order = armOrder(c.angles, view);
  /** spot: 0 が奥の置き場所、1 が前の置き場所 */
  const arm = (spot: number) => {
    const g = r.arms[order[spot]];
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].arm[spot]} ${-142 + L.shoulderDrop})${rot(g.upper)}">${seg(L.upperArm, 32, pass, cloth.arm)}<g transform="translate(0 ${L.upperArm})${rot(g.lower)}">${seg(L.lowerArm, 32, pass, cloth.arm)}${pass === "fill" ? `<circle cy="${L.lowerArm}" r="15" fill="${cloth.hand}" stroke="#000" stroke-width="5"/>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  const head = `<g transform="translate(${n(neckShift(r.neck))} ${-142 - L.headUp - NECK_LEN[look] - NECK_PIVOT})${rot(r.neck)} translate(0 ${NECK_PIVOT})">${
    look === "a" ? HEAD[view] + hat(HAT[c.role ?? "new"]) : headB(view, c.hair ?? "bob", c.hat ? HAT[c.role ?? "new"] : undefined)
  }</g>`;
  // 描く順: 奥の腕 → 奥の足 → 手前の足 → 胴 → 頭 → 手前の腕。
  // 手前の腕を頭より上へ挙げるとき（胴に対して 100° を超える）は、腕を頭の後ろへ回し、顔に重ねない
  const behind = c.angles[order[1] === 1 ? "arm_near_upper" : "arm_far_upper"] > 100;
  const body0 = torso(view, look);
  const upper = behind ? `${body0}${arm(1)}${head}` : `${body0}${head}${arm(1)}`;
  const body = `<g transform="rotate(${n(r.torso)})">${arm(0)}</g>${leg(0)}${leg(1)}<g transform="rotate(${n(r.torso)})">${upper}</g>`;
  return `<g data-part="figure" transform="translate(${n(c.x)} ${n(c.groundY - low * k)}) scale(${(d * k).toFixed(4)} ${k.toFixed(4)})">${body}</g>`;
}
