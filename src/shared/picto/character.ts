// 人の新しい絵柄（11/3 に作者が「正」とした手元の試しの絵）を、骨格の角度（skeleton.ts の 10 か所と範囲）で描く試し。
// 長さと太さは新しい絵柄のまま（胴 142・もも 85・すね 77・上腕 70・前腕 52、単位は背の高さ 434 の中の値）、
// 角度の決まり（真下が 0、前へ正。腕は胴に対して、足は腰に対して）は posePoints と同じ。
// 関節ごとに g を入れ子にして回すので、どんな角度でも手足と靴が体から外れない。
import type { Angles } from "./poses";

/** 正面は立って向き合う場面のため。胴と首は傾けず、腕と足は横へ開く */
export type View = "front" | "quarter" | "side";
export type CharacterRole = "new" | "lead" | "worker";
/** 絵柄の道。b（作者が Illustrator で描き直した髪・点の鼻の顔）が初めの値。a は 11/3 に仮に決めた丸頭とかぶり物 */
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

/**
 * 部位の置き場所（[奥, 手前]）。右を向くと体の右側がこちらを向くので、斜めでは手前の腕と足が画面の左（向きと逆の側）に来る。
 * 真横は前後に重ねる。正面は左右に開く
 */
export const SPOT: Record<View, { arm: [number, number]; leg: [number, number] }> = {
  front: { arm: [-56, 56], leg: [-20, 20] },
  quarter: { arm: [42, -42], leg: [18, -18] },
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

/**
 * 正面から見た靴（つま先がこちらを向く）。i は 0 が画面の左の足、1 が右の足。
 * 内側はすねの縁に合わせてまっすぐ下ろし、外側だけ少し広げる（左右の靴が重ならない）
 */
export function shoeFront(i: number, ankle: number): string {
  const s = i === 0 ? 1 : -1;
  const x = (v: number) => n(v * s);
  return `<g transform="rotate(${n(ankle)})"><path d="M${x(-16)} -8H${x(17.5)}V19Q${x(17.5)} 25 ${x(11.5)} 25H${x(-14)}Q${x(-23)} 25 ${x(-21)} 15Z" fill="#222" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="M${x(-19)} 25H${x(14)}" stroke="#000" stroke-width="6" stroke-linecap="round"/></g>`;
}

/** 胴（原点＝腰。斜めと正面はふつうの幅、真横は細く、ベストの V を前寄りに） */
export const torso = (view: View, look: Look) => {
  const c = CLOTH[look];
  return view !== "side"
    ? `<rect x="-46" y="-142" width="92" height="162" rx="30" fill="${c.shirt}" stroke="#000" stroke-width="6"/>` +
        `<path d="M-46 -110Q-46 -142 -20 -142L0 -100L20 -142Q46 -142 46 -110V18H-46Z" fill="${c.vest}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
        `<path d="M-43 -40H43" stroke="#333" stroke-width="12"/>`
    : `<rect x="-30" y="-142" width="60" height="162" rx="20" fill="${c.shirt}" stroke="#000" stroke-width="6"/>` +
        `<path d="M-30 -110Q-30 -142 -8 -142L10 -100L28 -142Q30 -142 30 -110V18H-30Z" fill="${c.vest}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
        `<path d="M-27 -40H27" stroke="#333" stroke-width="12"/>`;
};

/** 頭（原点＝首の付け根。目は半径 6、真横は目 1 つで鼻なし）とかぶり物（つばは前だけ） */
const HEAD: Record<View, string> = {
  front:
    `<circle cy="-45" r="45" fill="#ccc" stroke="#000" stroke-width="6"/><circle cx="-14" cy="-38" r="6"/><circle cx="14" cy="-38" r="6"/>` +
    `<path d="M-10 -19Q0 -11 10 -19" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  quarter:
    `<circle cy="-45" r="45" fill="#ccc" stroke="#000" stroke-width="6"/><circle cx="6" cy="-38" r="6"/><circle cx="30" cy="-38" r="6"/>` +
    `<path d="M10 -19Q20 -11 30 -19" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  side:
    `<circle cy="-45" r="45" fill="#ccc" stroke="#000" stroke-width="6"/><circle cx="24" cy="-38" r="6"/>` +
    `<path d="M28 -20Q36 -14 42 -24" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`,
};
/**
 * b の顔（原点＝首の付け根）。作者が Illustrator で描き直した形をそのまま使う（private の下絵の描き終わり、11/3）。
 * 顔は幅 90・高さ 70 の角の丸い形で、頭の上 20 は髪が埋める。目は小さな黒い楕円、鼻は点、口はやわらかく笑った線。
 * 線は顔も首も体と同じ 5
 */
export const FACE_SHAPE = `<path d="M-18 -70H18Q44 -70 44.6 -48L45.4 -30Q45 0 12 0H-12Q-44.6 0.4 -45 -30L-44.4 -48Q-44 -70 -18 -70Z" fill="#fff" stroke="#000" stroke-width="5" stroke-linejoin="round"/>`;
const eyeB = (cx: number) => `<ellipse cx="${cx}" cy="-37" rx="4.6" ry="5.8"/>`;
const mouthB = (d: string) => `<path d="${d}" stroke="#000" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
const FACE_B: Record<View, string> = {
  front: `${FACE_SHAPE}${eyeB(-14)}${eyeB(14)}<circle cx="0" cy="-25" r="2"/>${mouthB("M-7 -16Q0 -10.5 7 -16")}`,
  quarter: `${FACE_SHAPE}${eyeB(8)}${eyeB(30)}<circle cx="21" cy="-25" r="2"/>${mouthB("M13.5 -16Q20 -10.5 26.5 -16")}`,
  side: `${FACE_SHAPE}${eyeB(27)}<circle cx="37" cy="-27" r="2.2"/>${mouthB("M28.5 -16Q32.5 -11.5 36.5 -16")}`,
};
/**
 * b の髪（顔の上に重ねる黒い形。内側の縁が生え際になる）。back は顔より後ろに描く分（お団子）、gloss は頭の丸みのつやの線。
 * おかっぱ（bob）は作者の描き直し: まっすぐな前髪を真ん中で分け、分け目は顔の向きへ寄せる。真横は前髪が額の前で高く、後ろへ下がる
 */
const HAIR_B: Record<Hair, Record<View, { back?: string; front: string; gloss?: string }>> = {
  bob: {
    front: {
      front: "M-49 -16v-36c0-21 22-38 49-38s49 17 49 38v36c0 4.67-2 6.83-6 6.5c-3-.33-4.5-2.5-4.5-6.5v-41.41c-12.33 4-23.17 4.67-32.5 2L2 -68.3l-5 12.89c-11.33 3-23.17 2.33-35.5-2V-16c0 4-1.5 6.17-4.5 6.5C-47 -9.17-49 -11.33-49 -16Z",
      gloss: "M-30 -64c2-8 7.67-13.33 17-16",
    },
    quarter: {
      front: "M-51 -16L-51 -52C-51 -73 -29 -90 -2 -90C25 -90 50 -73 50 -52L49.5 -16Q48.5 -9 43 -9.5Q39 -10 39 -16L39 -57.4C30 -54.5 22.5 -54 17 -55.4L12.5 -68.3L8 -55.4C0 -53.5 -7 -54 -14 -57.4L-14 -16Q-14.5 -9.5 -22 -9.5L-43 -9Q-51.5 -9.5 -51 -16Z",
      gloss: "M-34 -62Q-31 -76 -16 -80",
    },
    side: {
      front: "M-52 -16L-52 -52C-52 -73 -28 -90 -2 -90C28 -90 48 -80 47 -67Q30 -53 5 -57L4.5 -16Q4 -9 -4 -9L-43 -9.4Q-52 -9.6 -52 -16Z",
      gloss: "M-36 -64Q-32 -77 -16 -82",
    },
  },
  short: {
    front: { front: "M-49 -46C-50 -76 -26 -92 0 -92S50 -76 49 -46Q42 -58 30 -58Q14 -56 2 -66Q-12 -56 -30 -58Q-42 -58 -49 -46Z" },
    quarter: { front: "M47 -57C49 -96 16 -104 -10 -102C-44 -98 -54 -74 -50 -44Q-48 -32 -40 -27Q-37 -44 -30 -53C-16 -68 16 -72 34 -64Q41 -61 47 -57Z" },
    side: { front: "M46 -60C46 -94 18 -104 -10 -102C-44 -98 -54 -74 -50 -44Q-46 -30 -34 -26Q-30 -44 -20 -54C-4 -68 24 -70 46 -60Z" },
  },
  bun: {
    front: {
      back: `<circle cx="0" cy="-100" r="17" fill="#000" stroke="#000" stroke-width="4.5"/>`,
      front: "M-49 -40C-50 -76 -26 -92 0 -92S50 -76 49 -40Q44 -56 30 -60Q14 -62 0 -68Q-14 -62 -30 -60Q-44 -56 -49 -40Z",
    },
    quarter: {
      back: `<circle cx="-36" cy="-94" r="17" fill="#000" stroke="#000" stroke-width="4.5"/>`,
      front: "M48 -55C50 -96 16 -104 -10 -102C-46 -98 -58 -72 -54 -40Q-50 -22 -40 -18Q-36 -40 -30 -52C-16 -70 16 -72 36 -62Q43 -59 48 -55Z",
    },
    side: {
      back: `<circle cx="-40" cy="-90" r="17" fill="#000" stroke="#000" stroke-width="4.5"/>`,
      front: "M46 -58C46 -94 18 -104 -10 -102C-46 -98 -58 -72 -54 -40Q-48 -20 -36 -18Q-30 -40 -20 -54C-4 -70 24 -70 46 -58Z",
    },
  },
};
const headB = (view: View, hair: Hair, hatFill?: string) => {
  const h = HAIR_B[hair][view];
  const gloss = h.gloss ? `<path d="${h.gloss}" fill="none" stroke="#777" stroke-width="3" stroke-linecap="round"/>` : "";
  return `${h.back ?? ""}${NECK_B}${FACE_B[view]}<path d="${h.front}" fill="#000" stroke="#000" stroke-width="4.5" stroke-linejoin="round"/>${gloss}${hatFill ? hat(hatFill, view) : ""}`;
};

/** かぶり物。つばは前だけ。正面ではつばがこちらを向くので、頭の下の縁に平たい半月として描く */
const hat = (fill: string, view: View) =>
  view === "front"
    ? `<path d="M-50 -58Q-52 -104 0 -104Q52 -104 50 -58Z" fill="${fill}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
      `<path d="M-56 -60H56Q54 -48 0 -48Q-54 -48 -56 -60Z" fill="${fill}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>`
    : `<path d="M-50 -52Q-52 -104 0 -104Q44 -104 50 -62H88V-50H-50Z" fill="${fill}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>`;

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
function rig(a: Angles, view: View) {
  // 正面は胴と首を傾けず、手足の角度を横へ開く向きに読む（画面の左の手足は時計回り、右は反時計回り）
  const front = view === "front";
  const sign = (i: number) => (front && i === 0 ? 1 : -1);
  const legs = (["far", "near"] as const).map((s, i) => {
    const thigh = sign(i) * a[`leg_${s}_upper`];
    const shin = sign(i) * a[`leg_${s}_lower`];
    // 靴底を床と平行に戻す回転。戻しすぎると靴の口と靴底の向きの差で靴の形がねじれるので ±25° までにし、残りは靴ごと傾ける（しゃがむとかかとが上がる）
    return { s, thigh, shin, ankle: Math.max(-ANKLE_MAX, Math.min(ANKLE_MAX, -(thigh + shin))) };
  });
  const arms = (["far", "near"] as const).map((s, i) => ({ s, upper: sign(i) * a[`arm_${s}_upper`], lower: sign(i) * a[`arm_${s}_lower`] }));
  return { torso: front ? 0 : a.torso, neck: front ? 0 : a.neck, legs, arms };
}

/** 首は頭の下の方（首の付け根から 30 上）を軸に回し、うつむくほど少し前へ出す。胴の上の端で回すと頭が胴の前へずれる */
const NECK_PIVOT = 30;
/** b は頭を少し持ち上げて、あごと胴の間に短い首を見せる（a は首なし） */
export const NECK_LEN: Record<Look, number> = { a: 0, b: 14 };
export const NECK_B = `<rect x="-11" y="-6" width="22" height="${NECK_LEN.b + 14}" fill="#fff" stroke="#000" stroke-width="5"/>`;
const neckShift = (deg: number) => Math.sin((deg * Math.PI) / 180) * 10;

/** いちばん低い点（靴底・ひざ・手・頭）の腰からの高さ。地面に置くのに使う */
function lowest(a: Angles, view: View, look: Look): number {
  const r = rig(a, view);
  const ys: number[] = [];
  r.legs.forEach((g, i) => {
    const hip = T(SPOT[view].leg[i], 0);
    const knee = mul(mul(hip, R(g.thigh)), T(0, L.thigh));
    const ankle = mul(mul(knee, R(g.shin)), T(0, L.shin));
    const foot = mul(ankle, R(g.ankle));
    ys.push(at(knee, 0, 20), ...[-22, 38].map((x) => at(foot, x, L.sole)));
  });
  const torso = R(r.torso);
  r.arms.forEach((g, spot) => {
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
  const r = rig(c.angles, view);
  const look = c.look ?? "b";
  const cloth = CLOTH[look];
  const k = c.height / UNIT;
  const d = c.facing === "right" ? 1 : -1;
  const low = lowest(c.angles, view, look);
  // 手足は 1 本ごとに 2 回描く: まず全部の段の縁（黒）、次に全部の段の中身（灰色）。
  // 段ごとに縁と中身を描くと、下の段の縁が上の段の中身に重なって関節の線（ロボットのような区切り）が出る。
  // 2 回に分けると、ひじ・ひざの内側の縁は中身に埋もれて消え、外まわりの縁だけが 1 本につながる
  const leg = (i: number) => {
    const g = r.legs[i];
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].leg[i]} 0)${rot(g.thigh)}">${seg(L.thigh, 40, pass, cloth.leg)}<g transform="translate(0 ${L.thigh})${rot(g.shin)}">${seg(L.shin, 40, pass, cloth.leg)}${pass === "fill" ? `<g transform="translate(0 ${L.shin})">${view === "front" ? shoeFront(i, g.ankle) : shoe(g.ankle)}</g>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  /** spot: 0 が奥の腕（far）、1 が手前の腕（near） */
  const arm = (spot: number) => {
    const g = r.arms[spot];
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].arm[spot]} ${-142 + L.shoulderDrop})${rot(g.upper)}">${seg(L.upperArm, 32, pass, cloth.arm)}<g transform="translate(0 ${L.upperArm})${rot(g.lower)}">${seg(L.lowerArm, 32, pass, cloth.arm)}${pass === "fill" ? `<circle cy="${L.lowerArm}" r="15" fill="${cloth.hand}" stroke="#000" stroke-width="5"/>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  const head = `<g transform="translate(${n(neckShift(r.neck))} ${-142 - L.headUp - NECK_LEN[look] - NECK_PIVOT})${rot(r.neck)} translate(0 ${NECK_PIVOT})">${
    look === "a" ? HEAD[view] + hat(HAT[c.role ?? "new"], view) : headB(view, c.hair ?? "bob", c.hat ? HAT[c.role ?? "new"] : undefined)
  }</g>`;
  // 描く順: 奥の腕 → 奥の足 → 手前の足 → 胴 → 頭 → 手前の腕。正面は両腕とも体の前（胴と頭のあと）に描く。
  // 手前の腕を頭より上へ挙げるとき（胴に対して 100° を超える）は、腕を頭の後ろへ回し、顔に重ねない
  const behind = c.angles.arm_near_upper > 100;
  const body0 = torso(view, look);
  const front = view === "front";
  const upper = behind ? `${body0}${arm(1)}${head}` : `${body0}${head}${front ? arm(0) : ""}${arm(1)}`;
  const body = `<g transform="rotate(${n(r.torso)})">${front ? "" : arm(0)}</g>${leg(0)}${leg(1)}<g transform="rotate(${n(r.torso)})">${upper}</g>`;
  return `<g data-part="figure" transform="translate(${n(c.x)} ${n(c.groundY - low * k)}) scale(${(d * k).toFixed(4)} ${k.toFixed(4)})">${body}</g>`;
}
