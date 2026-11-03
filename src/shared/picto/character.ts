// 人の新しい絵柄（11/3 に作者が「正」とした手元の試しの絵）を、骨格の角度（skeleton.ts の 10 か所と範囲）で描く試し。
// 長さと太さは新しい絵柄のまま（胴 142・もも 85・すね 77・上腕 70・前腕 52、単位は背の高さ 434 の中の値）、
// 角度の決まり（真下が 0、前へ正。腕は胴に対して、足は腰に対して）は posePoints と同じ。
// 関節ごとに g を入れ子にして回すので、どんな角度でも手足と靴が体から外れない。
import type { Angles } from "./poses";

export type View = "quarter" | "side";
export type CharacterRole = "new" | "lead" | "worker";

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
}

const UNIT = 434;
const L = { torso: 142, shoulderDrop: 22, upperArm: 70, lowerArm: 52, thigh: 85, shin: 77, sole: 25, headUp: 2 };
const HAT: Record<CharacterRole, string> = { new: "#fff", lead: "#222", worker: "#999" };

/** 部位の置き場所（左右）。斜めは腕と足を胴の左右へ、真横は前後に重ねる */
const SPOT: Record<View, { arm: [number, number]; leg: [number, number] }> = {
  quarter: { arm: [-42, 42], leg: [-18, 18] },
  side: { arm: [-6, 4], leg: [-8, 6] },
};

const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
/** 手足の 1 段（0,0 から真下へ len）。縁の回は黒で太く、中身の回は灰色で 12 細く描く */
type Pass = "edge" | "fill";
const seg = (len: number, w: number, pass: Pass) =>
  pass === "edge"
    ? `<path d="M0 0V${len}" stroke="#000" stroke-width="${w}" stroke-linecap="round"/>`
    : `<path d="M0 0V${len}" stroke="#666" stroke-width="${w - 12}" stroke-linecap="round"/>`;
const rot = (deg: number) => (deg ? ` rotate(${n(deg)})` : "");

/** 靴（原点＝足首。かかとは足の後ろの縁、つま先は前へ。靴底の下端は足首から 25 下） */
const SHOE =
  `<path d="M-18 -8L-22 16Q-22 25 -13 25H30Q38 25 38 17Q38 10 30 9L16 -2Q15 -5 14 -8Z" fill="#222" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
  `<path d="M-20 25H38" stroke="#000" stroke-width="6" stroke-linecap="round"/>`;

/** 胴（原点＝腰。斜めはふつうの幅、真横は細く、ベストの V を前寄りに） */
const TORSO: Record<View, string> = {
  quarter:
    `<rect x="-46" y="-142" width="92" height="162" rx="30" fill="#666" stroke="#000" stroke-width="6"/>` +
    `<path d="M-46 -110Q-46 -142 -20 -142L0 -100L20 -142Q46 -142 46 -110V18H-46Z" fill="#999" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="M-43 -40H43" stroke="#333" stroke-width="12"/>`,
  side:
    `<rect x="-30" y="-142" width="60" height="162" rx="20" fill="#666" stroke="#000" stroke-width="6"/>` +
    `<path d="M-30 -110Q-30 -142 -8 -142L10 -100L28 -142Q30 -142 30 -110V18H-30Z" fill="#999" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="M-27 -40H27" stroke="#333" stroke-width="12"/>`,
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
const hat = (fill: string) => `<path d="M-50 -52Q-52 -104 0 -104Q44 -104 50 -62H88V-50H-50Z" fill="${fill}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>`;

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
    return { s, thigh, shin, ankle: -(thigh + shin) };
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
const neckShift = (deg: number) => Math.sin((deg * Math.PI) / 180) * 10;

/** いちばん低い点（靴底・ひざ・手・頭）の腰からの高さ。地面に置くのに使う */
function lowest(a: Angles, view: View): number {
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
  const head = mul(mul(mul(torso, T(neckShift(r.neck), -142 - L.headUp - NECK_PIVOT)), R(r.neck)), T(0, NECK_PIVOT));
  ys.push(at(head, 0, 0), at(head, 0, -104));
  return Math.max(...ys);
}

/** 人 1 人の SVG（g 1 つ） */
export function characterSvg(c: CharacterSpec): string {
  const view = c.view ?? "quarter";
  const r = rig(c.angles);
  const k = c.height / UNIT;
  const d = c.facing === "right" ? 1 : -1;
  const low = lowest(c.angles, view);
  // 手足は 1 本ごとに 2 回描く: まず全部の段の縁（黒）、次に全部の段の中身（灰色）。
  // 段ごとに縁と中身を描くと、下の段の縁が上の段の中身に重なって関節の線（ロボットのような区切り）が出る。
  // 2 回に分けると、ひじ・ひざの内側の縁は中身に埋もれて消え、外まわりの縁だけが 1 本につながる
  const leg = (i: number) => {
    const g = r.legs[i];
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].leg[i]} 0)${rot(g.thigh)}">${seg(L.thigh, 40, pass)}<g transform="translate(0 ${L.thigh})${rot(g.shin)}">${seg(L.shin, 40, pass)}${pass === "fill" ? `<g transform="translate(0 ${L.shin})${rot(g.ankle)}">${SHOE}</g>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  const order = armOrder(c.angles, view);
  /** spot: 0 が奥の置き場所、1 が前の置き場所 */
  const arm = (spot: number) => {
    const g = r.arms[order[spot]];
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].arm[spot]} ${-142 + L.shoulderDrop})${rot(g.upper)}">${seg(L.upperArm, 32, pass)}<g transform="translate(0 ${L.upperArm})${rot(g.lower)}">${seg(L.lowerArm, 32, pass)}${pass === "fill" ? `<circle cy="${L.lowerArm}" r="15" fill="#ccc" stroke="#000" stroke-width="5"/>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  const head = `<g transform="translate(${n(neckShift(r.neck))} ${-142 - L.headUp - NECK_PIVOT})${rot(r.neck)} translate(0 ${NECK_PIVOT})">${HEAD[view]}${hat(HAT[c.role ?? "new"])}</g>`;
  // 描く順: 奥の腕 → 奥の足 → 手前の足 → 胴 → 頭 → 手前の腕。
  // 手前の腕を頭より上へ挙げるとき（胴に対して 100° を超える）は、腕を頭の後ろへ回し、顔に重ねない
  const behind = c.angles[order[1] === 1 ? "arm_near_upper" : "arm_far_upper"] > 100;
  const upper = behind ? `${TORSO[view]}${arm(1)}${head}` : `${TORSO[view]}${head}${arm(1)}`;
  const body = `<g transform="rotate(${n(r.torso)})">${arm(0)}</g>${leg(0)}${leg(1)}<g transform="rotate(${n(r.torso)})">${upper}</g>`;
  return `<g data-part="figure" transform="translate(${n(c.x)} ${n(c.groundY - low * k)}) scale(${(d * k).toFixed(4)} ${k.toFixed(4)})">${body}</g>`;
}
