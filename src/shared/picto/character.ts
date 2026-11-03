// 人の新しい絵柄（11/3 に作者が「正」とした手元の試しの絵）を、骨格の角度（skeleton.ts の 10 か所と範囲）で描く試し。
// 長さと太さは新しい絵柄のまま（胴 142・もも 85・すね 77・上腕 70・前腕 52、単位は背の高さ 434 の中の値）、
// 角度の決まり（真下が 0、前へ正。腕は胴に対して、足は腰に対して）は posePoints と同じ。
// 関節ごとに g を入れ子にして回すので、どんな角度でも手足と靴が体から外れない。
import { armbandSvg, bootSvg, cuffSvg, earSvg, farTone, headMarks, hem, maskSvg, type Outfit, outfitTorso, visorSvg } from "./outfit";
import { DEFAULT_FACE, earsSvg, type FaceParts, faceHalfWidth, faceSvg, glassesSvg, hairScale, SKIN_TONE } from "./avatar";
import { TRACED, TRACED_TOP, type TracedHair } from "./hair-traced";
import type { Angles } from "./poses";

/** 正面は立って向き合う場面のため。胴と首は傾けず、腕と足は横へ開く */
export type View = "front" | "quarter" | "side";
export type CharacterRole = "new" | "lead" | "worker";
/** 絵柄の道。b（作者が Illustrator で描き直した髪・点の鼻の顔）が初めの値。a は 11/3 に仮に決めた丸頭とかぶり物 */
export type Look = "a" | "b";
/** 髪形。bob・short・bun が初めからの 3 つ、残りはキャラクターを作る画面で足した 5 つ（製品仕様 §14） */
/** 手で描いた髪（おかっぱと、かぶり物の下に押し込む形） */
type HandHair = "bob" | "short" | "bun" | "long" | "ponytail" | "buzz" | "sidePart" | "curly";
/** 髪形 20。かぶらないときは、おかっぱ以外は参考絵から取り出した形（hair-traced.ts）。かぶると手で描いた形に押し込む */
export type Hair = HandHair | TracedHair;
/**
 * かぶり物の種類。髪とは別の枠で、職場と場面で付け外しする（髪はその人のもので、いつも描く）。
 * helmet＝安全帽（電気・建設）、cap＝つばの帽子、chef＝コック帽（厨房・製菓）、chefLow＝見習いの低いコック帽、hygiene＝髪をしまう衛生キャップ（食品の工場）
 */
export type HeadwearKind =
  | "helmet" | "cap" | "chef" | "chefLow" | "hygiene"
  // 11/3 に足した下絵: 制帽（警備・鉄道・運転）、船長の帽子、つばの広い帽子、手ぬぐい・三角巾、ニット帽、看護・客室の帽子、
  // クリーンルームのフード、溶接の面（下ろす・上げる）
  | "peaked" | "captain" | "straw" | "towel" | "knit" | "nurse" | "hood" | "welder" | "welderUp";

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
  /** かぶり物。"none" はかぶっていない（「かぶらないのはダメ」の場面にも使う）。初めの値は a が cap、b が none */
  headwear?: HeadwearKind | "none";
  /** 職場の服と役の印（outfit.ts。下絵） */
  outfit?: Outfit;
  /** 顔の部品（avatar.ts。キャラクターを作る画面で選ぶ）。無い部品は初めの値 */
  face?: Partial<FaceParts>;
}

const UNIT = 434;
export const L = { torso: 142, shoulderDrop: 22, upperArm: 70, lowerArm: 52, thigh: 85, shin: 77, sole: 25, headUp: 2 };
/** 役の明るさ。色を変えられるかぶり物（安全帽・つばの帽子）は、この明るさで役を見分ける */
const ROLE_TONE: Record<CharacterRole, string> = { new: "#fff", lead: "#222", worker: "#999" };

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

/** 絵柄ごとの服の色（腕＝袖、足＝ズボン、legFar＝奥の足、靴、奥の靴、手、胴、ベスト）。奥の足と靴は 1 段暗くして、重なっても 2 本に見せる（光はカメラの側から当たるので、奥ほどトーンが落ちる） */
const CLOTH: Record<Look, { arm: string; leg: string; legFar: string; shoe: string; shoeFar: string; hand: string; shirt: string; vest: string }> = {
  a: { arm: "#666", leg: "#808080", legFar: "#444", shoe: "#3a3a3a", shoeFar: "#151515", hand: "#ccc", shirt: "#666", vest: "#999" },
  b: { arm: "#fff", leg: "#7a7a7a", legFar: "#333", shoe: "#3a3a3a", shoeFar: "#151515", hand: "#fff", shirt: "#fff", vest: "#ccc" },
};
const rot = (deg: number) => (deg ? ` rotate(${n(deg)})` : "");

/**
 * 靴（原点＝足首、すねの向きの座標で描く）。
 * 靴の口（足を入れる上の辺）はすねに直角のまま、すねと一緒に傾く。かかと・靴底・つま先は床と平行に置く（ankle だけ回した向き）。
 * 2 つの向きの点を 1 つの形でつなぐので、すねが傾いても口が足からずれず、靴底は床に乗る。
 * ankle は靴底を床と平行に戻す回転（度）。靴底の下端は足首から 25 下
 */
export function shoe(ankle: number, fill = "#222"): string {
  const r = (ankle * Math.PI) / 180;
  const f = (x: number, y: number) => `${n(x * Math.cos(r) - y * Math.sin(r))} ${n(x * Math.sin(r) + y * Math.cos(r))}`;
  const body =
    `M-18 -8L${f(-22, 16)}Q${f(-22, 25)} ${f(-13, 25)}L${f(30, 25)}Q${f(38, 25)} ${f(38, 17)}Q${f(38, 10)} ${f(30, 9)}L${f(16, -2)}Q15 -5 14 -8Z`;
  return `<path d="${body}" fill="${fill}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="M${f(-20, 25)}L${f(38, 25)}" stroke="#000" stroke-width="6" stroke-linecap="round"/>`;
}

/**
 * 正面から見た靴（つま先がこちらを向く）。i は 0 が画面の左の足、1 が右の足。
 * 内側はすねの縁に合わせてまっすぐ下ろし、外側だけ少し広げる（左右の靴が重ならない）
 */
export function shoeFront(i: number, ankle: number, fill = "#222"): string {
  const s = i === 0 ? 1 : -1;
  const x = (v: number) => n(v * s);
  return `<g transform="rotate(${n(ankle)})"><path d="M${x(-16)} -8H${x(17.5)}V19Q${x(17.5)} 25 ${x(11.5)} 25H${x(-14)}Q${x(-23)} 25 ${x(-21)} 15Z" fill="${fill}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="M${x(-19)} 25H${x(14)}" stroke="#000" stroke-width="6" stroke-linecap="round"/></g>`;
}

/**
 * ベストの V（襟の開き）。正面はまん中で左右同じ。斜めは胸が向く側へ寄せ、手前の辺は長く、奥の辺は縮めて立てる
 * （奥の襟は体の丸みで回り込んで見える）。真横はさらに前へ寄せる
 */
const VEST_V: Record<View, string> = {
  front: "-20 -142L0 -100L20 -142",
  quarter: "-12 -142L10 -100L24 -142",
  side: "-6 -142L8 -100L18 -142",
};
// 真横の V は胴の角の丸み（rx 20）の内側で止める。28 まで開くと、角の外へベストの角が突き出て、首元が前へ「ぽこっ」と出て見えた
/** 胴（原点＝腰。斜めと正面はふつうの幅、真横は細く） */
export const torso = (view: View, look: Look) => {
  const c = CLOTH[look];
  const w = view === "side" ? 30 : 46;
  return `<rect x="${-w}" y="-142" width="${w * 2}" height="162" rx="${view === "side" ? 20 : 30}" fill="${c.shirt}" stroke="#000" stroke-width="6"/>` +
    `<path d="M${-w} -110Q${-w} -142 ${VEST_V[view]}Q${w} -142 ${w} -110${hem(w, 18, view)}" fill="${c.vest}" stroke="#000" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="M${-w + 3} -40H${w - 3}" stroke="#333" stroke-width="12"/>`;
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
// 目・鼻・口は avatar.ts の faceSvg が向きごとの目印から描く（初めの値は今までの絵と同じ文字列）
/**
 * b の髪（顔の上に重ねる黒い形。内側の縁が生え際になる）。back は顔より後ろに描く分（お団子）、gloss は頭の丸みのつやの線。
 * おかっぱ（bob）は作者の描き直し: まっすぐな前髪を真ん中で分け、分け目は顔の向きへ寄せる。真横は前髪が額の前で高く、後ろへ下がる
 */
/** くせ毛の塊（てっぺん −104 前後・半幅 55）。外形に半径 8 の丸い房を並べる。dx は後ろへ寄せる量、sx は横を詰める倍率。
 * open は顔の向いた側（右）の横の房を外し、生え際を額の高さ（−64）で前へ抜く（斜め・真横で目と眉を隠さない） */
function curly(dx: number, sx: number, open = false) {
  // 前髪の下の縁は眉（y −48）より上の −58〜−64 に止める
  const base = open
    ? "M-55 -40C-56 -84 -30 -100 0 -100S52 -88 50 -66Q40 -64 28 -64Q8 -64 -10 -58Q-30 -50 -40 -34Q-50 -28 -55 -40Z"
    : "M-55 -40C-56 -84 -30 -100 0 -100S56 -84 55 -40Q52 -30 47 -38Q38 -58 18 -62Q0 -64 -18 -62Q-38 -58 -47 -38Q-52 -30 -55 -40Z";
  const bumps = (open ? [190, 206, 222, 238, 254, 270, 286, 302, 318] : [190, 206, 222, 238, 254, 270, 286, 302, 318, 334, 350]).map((a) => {
    const r = (a * Math.PI) / 180;
    return `<circle cx="${Math.round(50 * Math.cos(r))}" cy="${Math.round(-58 + 38 * Math.sin(r))}" r="8"/>`;
  }).join("") + `<circle cx="-53" cy="-46" r="7"/>` + (open
    ? [334, 350].map((a) => `<circle cx="${Math.round(45 * Math.cos((a * Math.PI) / 180))}" cy="${Math.round(-58 + 34 * Math.sin((a * Math.PI) / 180))}" r="5"/>`).join("")
    : `<circle cx="53" cy="-46" r="7"/>`);
  return `<g transform="translate(${dx} 0)${sx === 1 ? "" : ` scale(${sx} 1)`}" fill="HAIRFILL" stroke="#000" stroke-width="4.5" stroke-linejoin="round"><path d="${base}"/>${bumps}</g>`;
}
/** 髪の塗り。坊主は地肌が透けるので明るめ */
const HAIR_FILL: Partial<Record<Hair, string>> = { buzz: "#444" };
/** かぶり物をかぶったとき、ほかの形に押し込む髪（くせ毛は short の形になる） */
const UNDER_HAT: Partial<Record<Hair, HandHair>> = {
  curly: "short",
  // 参考絵から取り出した髪は縁の下の形が無いので、近い手描きの髪に押し込む（スキンヘッドは何も描かない）
  twoBlock: "short", mash: "bob", centerPart: "long", slickBack: "short", shortBob: "bob", braids: "long",
  twinTails: "ponytail", softMohawk: "buzz", wolf: "long", halfUp: "long",
};
/** かぶらないときの頭のいちばん上（地面に置くのに使う）。無い髪は −92 */
const HAIR_TOP: Partial<Record<Hair, number>> = TRACED_TOP;
const HAIR_B: Record<HandHair, Record<View, { back?: string; behind?: string; front: string; gloss?: string }>> = {
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
    front: { front: "M-49 -34C-50 -76 -26 -92 0 -92S50 -76 49 -34Q44 -38 42 -50Q38 -58 30 -58Q14 -56 2 -66Q-12 -56 -30 -58Q-38 -58 -42 -50Q-44 -38 -49 -34Z" },
    // 斜めと真横は正面と同じ髪型に見えるよう、おかっぱの斜め・真横と同じ組み立て（分け目を顔の向きへ寄せる）で、丈を耳の上までにした
    quarter: { front: "M-51 -32L-51 -52C-51 -76 -28 -92 -2 -92C25 -92 51 -76 49 -34Q44 -38 42 -50Q39 -57 32 -57Q21 -57 12.5 -66Q4 -56 -10 -57Q-14 -46 -20 -38Q-34 -26 -51 -32Z" },
    side: { front: "M-52 -32L-52 -52C-52 -76 -28 -92 -2 -92C28 -92 48 -80 47 -64Q30 -54 6 -58Q4 -44 -6 -36Q-28 -24 -52 -32Z" },
  },
  // お団子の斜め・真横は 11/3 に正面と同じてっぺん（−92）・同じ組み立てに描き直した（てっぺんが 10 高く、別の髪形に見えるおそれがあった）
  bun: {
    front: {
      back: `<circle cx="0" cy="-100" r="17" fill="#000" stroke="#000" stroke-width="4.5"/>`,
      front: "M-49 -34C-50 -76 -26 -92 0 -92S50 -76 49 -34Q44 -38 42 -50Q38 -60 30 -60Q14 -62 0 -68Q-14 -62 -30 -60Q-38 -60 -42 -50Q-44 -38 -49 -34Z",
    },
    quarter: {
      back: `<circle cx="-36" cy="-94" r="17" fill="#000" stroke="#000" stroke-width="4.5"/>`,
      front: "M-51 -30L-51 -52C-51 -76 -28 -92 -2 -92C25 -92 51 -76 49 -36Q45 -40 43 -50Q38 -60 28 -62Q18 -64 10.5 -68Q-4 -62 -14 -58Q-22 -50 -24 -40Q-36 -26 -51 -30Z",
    },
    side: {
      back: `<circle cx="-40" cy="-90" r="17" fill="#000" stroke="#000" stroke-width="4.5"/>`,
      front: "M-52 -30L-52 -52C-52 -76 -28 -92 -2 -92C28 -92 48 -80 47 -64Q30 -66 12 -64Q-2 -58 -8 -46Q-14 -32 -26 -28Q-40 -24 -52 -30Z",
    },
  },
  // ここから下はキャラクターを作る画面で足した髪形。3 つの向きは同じ作り（てっぺんと丈の高さは同じ、分け目は正面 → 斜め +10.5 → 真横は顔の前の端、
  // 後ろの量は斜め・真横で後ろへ寄せる）から組み立てた下絵で、作者が Illustrator で直す。behind は胴より後ろに描く後ろ髪
  long: {
    front: {
      front: "M-49 30V-52c0-21 22-38 49-38s49 17 49 38V30q0 6-5.5 6q-5 0-5-6V-57.4c-12.33 4-23.17 4.67-32.5 2L2 -68.3l-5 12.89c-11.33 3-23.17 2.33-35.5-2V30q0 6-5 6Q-49 36 -49 30Z",
      behind: "M-54 -40Q-54 44 -40 44H40Q54 44 54 -40Z",
      gloss: "M-30 -64c2-8 7.67-13.33 17-16",
    },
    quarter: {
      front: "M-51 30L-51 -52C-51 -73 -29 -90 -2 -90C25 -90 50 -73 50 -52L49.5 30Q48.5 36 43 36Q39 36 39 30L39 -57.4C30 -54.5 22.5 -54 17 -55.4L12.5 -68.3L8 -55.4C0 -53.5 -7 -54 -14 -57.4L-28 -55.4L-28 30Q-28.5 36 -34 36L-43 36Q-51.5 36 -51 30Z",
      behind: "M-56 -40Q-58 44 -40 44H24Q30 44 30 -40Z",
      gloss: "M-34 -62Q-31 -76 -16 -80",
    },
    side: {
      front: "M-52 -16L-52 -52C-52 -73 -28 -90 -2 -90C28 -90 48 -80 47 -67Q30 -53 5 -57L4.5 -16Q4 -9 -4 -9L-43 -9.4Q-52 -9.6 -52 -16Z",
      behind: "M-56 -50Q-60 44 -40 44H-12Q-6 44 -8 -50Z",
      gloss: "M-36 -64Q-32 -77 -16 -82",
    },
  },
  ponytail: {
    // 前は bun と同じ（額を出してなでつける）。結び目は低い位置（かぶり物の縁より下）に置き、尾は背中の後ろへ垂らす。正面では尾は頭の真後ろに隠れる
    front: { front: "M-49 -34C-50 -76 -26 -92 0 -92S50 -76 49 -34Q44 -38 42 -50Q38 -60 30 -60Q14 -62 0 -68Q-14 -62 -30 -60Q-38 -60 -42 -50Q-44 -38 -49 -34Z" },
    quarter: {
      front: "M-51 -30L-51 -52C-51 -76 -28 -92 -2 -92C25 -92 51 -76 49 -36Q45 -40 43 -50Q38 -60 28 -62Q18 -64 10.5 -68Q-4 -62 -14 -58Q-22 -50 -24 -40Q-36 -26 -51 -30Z",
      behind: "M-50 -54Q-66 -20 -58 20Q-56 30 -48 26Q-42 -10 -42 -52Z",
    },
    side: {
      front: "M-52 -30L-52 -52C-52 -76 -28 -92 -2 -92C28 -92 48 -80 47 -64Q30 -66 12 -64Q-2 -58 -8 -46Q-14 -32 -26 -28Q-40 -24 -52 -30Z",
      behind: "M-54 -52Q-72 -16 -64 24Q-62 34 -52 30Q-46 -8 -46 -50Z",
    },
  },
  buzz: {
    // 坊主。頭に沿う薄い形（てっぺん −80）で、地肌が透けるのを明るさ（HAIR_FILL）で表す。額は広く出す。浮かせると帽子に見える
    front: { front: "M-47 -34C-48 -70 -26 -80 0 -80S48 -70 47 -34Q44 -48 40 -58Q24 -64 0 -64Q-24 -64 -40 -58Q-44 -48 -47 -34Z" },
    quarter: { front: "M-49 -32L-49 -50C-49 -70 -26 -80 0 -80C26 -80 49 -70 48 -40Q44 -52 36 -60Q14 -65 -8 -62Q-22 -56 -30 -44Q-40 -30 -49 -32Z" },
    side: { front: "M-50 -38L-50 -50C-50 -70 -26 -80 0 -80C28 -80 46 -72 45 -62Q30 -62 12 -58Q0 -52 -10 -46Q-30 -34 -50 -38Z" },
  },
  sidePart: {
    // 七三。分け目を顔の向く側（正面 x 12、斜め 22.5）に置き、前髪を反対側へ流す。真横は分け目が顔の前の端に溶けるので、
    // 流した前髪の先を額の前へ垂らして short と見分ける
    front: {
      front: "M-49 -30C-50 -74 -26 -92 0 -92S50 -76 49 -34Q45 -40 42 -52Q36 -60 26 -60Q20 -60 12 -66Q-6 -54 -26 -56Q-38 -56 -42 -46Q-46 -36 -49 -30Z",
      gloss: "M-30 -66Q-26 -78 -10 -82",
    },
    quarter: {
      front: "M-51 -30L-51 -52C-51 -76 -28 -92 -2 -92C25 -92 50 -76 49 -36Q45 -42 42 -54Q38 -60 30 -60L22.5 -66Q6 -54 -14 -56Q-20 -48 -26 -38Q-38 -26 -51 -30Z",
      gloss: "M-34 -64Q-30 -77 -14 -82",
    },
    side: {
      front: "M-52 -30L-52 -52C-52 -76 -28 -92 -2 -92C28 -92 49 -82 48 -60Q44 -53 37 -55Q22 -57 8 -58Q2 -46 -8 -36Q-28 -24 -52 -30Z",
      gloss: "M-36 -64Q-32 -77 -16 -82",
    },
  },
  curly: {
    // くせ毛。丸く大きな塊で、縁に丸い房を並べる。かぶり物をかぶると short の形に押し込む（UNDER_HAT）
    front: { front: curly(0, 1) },
    quarter: { front: curly(-2, 1, true) },
    side: { front: curly(-6, 0.96, true) },
  },
};
/**
 * かぶり物の表（原点＝首の付け根。顔は y −70〜0、髪は横に ±54・上に −106 まで、お団子は −111 まで）。
 * かぶり物は髪に覆いかぶさる大きさにする: 縁は髪の横幅より外へ、てっぺんは髪より上へ。髪が見えてよいのは、縁より下だけ。
 * tone: "role" は役の明るさで塗る、"white" はいつも白（コック帽・衛生キャップ）。
 * hair: "show" は髪の上に載せて、縁より下の髪がそのまま見える。"hide" は髪を全部しまう（髪を描かない）。
 * top は頭のいちばん上（地面に置くときに使う）、bottom は縁の下の端（ここより上の髪は全部かぶり物の中に入る）
 */
const STROKE = `stroke="#000" stroke-width="5" stroke-linejoin="round"`;
const chef = (dx: number) =>
  `<g transform="translate(${dx} 0)"><path d="M-50 -76C-82 -86 -76 -136 -40 -128C-34 -158 34 -158 40 -128C76 -136 82 -86 50 -76Z" FILL ${STROKE}/>` +
  `<path d="M-20 -80Q-24 -104 -16 -130M20 -80Q24 -104 16 -130" stroke="#000" stroke-width="3" fill="none" stroke-linecap="round"/>` +
  `<path d="M-58 -78H58V-52Q0 -45 -58 -52Z" FILL ${STROKE}/></g>`;
/** 見習いの低いコック帽（筒が短く、てっぺんが平ら） */
const chefLow = (dx: number) =>
  `<g transform="translate(${dx} 0)"><path d="M-56 -76Q-60 -104 0 -104Q60 -104 56 -76Z" FILL ${STROKE}/>` +
  `<path d="M-58 -78H58V-52Q0 -45 -58 -52Z" FILL ${STROKE}/></g>`;
/** 制帽（警備・鉄道・運転・船長）。山・帯・黒いひさし。ひさしは前だけ */
const peaked = (dx: number, view: View) => {
  const crown = `<path d="M${-60 + dx} -64L${-66 + dx} -102Q${dx} -116 ${66 + dx} -102L${60 + dx} -64Z" FILL ${STROKE}/><path d="M${-61 + dx} -70H${61 + dx}V-52H${-61 + dx}Z" FILL ${STROKE}/>`;
  const visor = view === "front" ? `<path d="M-50 -52Q0 -38 50 -52Z" fill="#222" ${STROKE}/>`
    : view === "quarter" ? `<path d="M-30 -52H58Q84 -50 82 -44Q50 -38 -30 -46Z" fill="#222" ${STROKE}/>`
    : `<path d="M28 -54H62Q92 -52 90 -46Q60 -40 28 -48Z" fill="#222" ${STROKE}/>`;
  return crown + visor;
};
/** つばの広い帽子（農業）。つばを先に、山をその上に描く */
const straw = (dx: number) =>
  `<ellipse cx="${dx}" cy="-60" rx="94" ry="13" FILL ${STROKE}/><path d="M${-56 + dx} -62Q${-60 + dx} -118 ${dx} -118Q${60 + dx} -118 ${56 + dx} -62Z" FILL ${STROKE}/><path d="M${-56 + dx} -72Q${dx} -78 ${56 + dx} -72" stroke="#000" stroke-width="5" fill="none"/>`;
/** 手ぬぐい・三角巾（頭を包み、結び目を後ろに） */
const towel = (dx: number, knot: number) =>
  `<path d="M${-58 + dx} -50Q${-64 + dx} -108 ${dx} -108Q${64 + dx} -108 ${58 + dx} -50Q${dx} -62 ${-58 + dx} -50Z" FILL ${STROKE}/>` +
  (knot ? `<path d="M${knot} -66L${knot - 22} -76L${knot - 18} -54Z" FILL ${STROKE}/>` : "");
/** ニット帽（折り返しの帯つき） */
const knit = (dx: number) =>
  `<path d="M${-58 + dx} -56Q${-62 + dx} -114 ${dx} -114Q${62 + dx} -114 ${58 + dx} -56Z" FILL ${STROKE}/><path d="M${-60 + dx} -70H${60 + dx}V-50H${-60 + dx}Z" FILL ${STROKE}/>`;
/** 看護・客室係の小さな帽子（頭の上に載せる。髪は覆わない） */
const nurse = (dx: number) =>
  `<path d="M${-36 + dx} -86L${-44 + dx} -108Q${dx} -118 ${44 + dx} -108L${36 + dx} -86Q${dx} -94 ${-36 + dx} -86Z" FILL ${STROKE}/>`;
/** クリーンルームのフード・溶接の面（頭を全部包み、顔の窓だけ開ける。fill-rule で窓を抜く） */
const hood = (view: View, win: string, dark: boolean) => {
  const outer = view === "side" ? "M-62 -4Q-70 -112 -4 -114Q54 -112 58 -60L64 -4Z" : view === "quarter" ? "M-60 -2Q-66 -112 2 -114Q64 -112 60 -2Z" : "M-58 -2Q-64 -114 0 -114Q64 -114 58 -2Z";
  return dark
    ? `<path d="${outer}" FILL ${STROKE}/><path d="${win}" fill="#777" ${STROKE}/>`
    : `<path d="${outer}${win}" fill-rule="evenodd" FILL ${STROKE}/>`;
};
const HOOD_WIN: Record<View, string> = {
  front: "M-36 -62H36Q42 -62 42 -54V-14Q42 -6 34 -6H-34Q-42 -6 -42 -14V-54Q-42 -62 -36 -62Z",
  quarter: "M-26 -62H44Q50 -62 50 -54V-14Q50 -6 42 -6H-26Q-34 -6 -34 -14V-54Q-34 -62 -26 -62Z",
  side: "M8 -62H50Q56 -62 57 -54L60 -12Q60 -6 52 -6H8Q2 -6 2 -14V-54Q2 -62 8 -62Z",
};
const WELD_WIN: Record<View, string> = {
  front: "M-30 -54H30V-40H-30Z",
  quarter: "M-18 -54H40V-40H-18Z",
  side: "M18 -54H54V-40H18Z",
};
/** 溶接の面を上げた形（頭の上に黒い面が載る） */
const welderUp = (dx: number) =>
  `<path d="M${-58 + dx} -58Q${-62 + dx} -122 ${dx} -122Q${62 + dx} -122 ${58 + dx} -58Z" FILL ${STROKE}/><path d="M${-30 + dx} -104H${30 + dx}V-92H${-30 + dx}Z" fill="#777" ${STROKE}/>`;
/** tone: role＝役の明るさ、white＝白、ほかは灰色の明るさ（#rgb） */
export const HEADWEAR: Record<HeadwearKind, { tone: string; hair: "show" | "hide"; top: number; bottom: number; draw: Record<View, string> }> = {
  peaked: {
    tone: "#333", hair: "show", top: -114, bottom: -52,
    draw: { front: peaked(0, "front"), quarter: peaked(-2, "quarter"), side: peaked(-6, "side") },
  },
  captain: {
    tone: "white", hair: "show", top: -114, bottom: -52,
    draw: { front: peaked(0, "front"), quarter: peaked(-2, "quarter"), side: peaked(-6, "side") },
  },
  straw: {
    tone: "#ddd", hair: "show", top: -116, bottom: -56,
    draw: { front: straw(0), quarter: straw(4), side: straw(-2) },
  },
  towel: {
    tone: "white", hair: "show", top: -108, bottom: -52,
    draw: { front: towel(0, 0), quarter: towel(-2, -54), side: towel(-4, -60) },
  },
  knit: {
    tone: "#444", hair: "show", top: -114, bottom: -52,
    draw: { front: knit(0), quarter: knit(-2), side: knit(-4) },
  },
  nurse: {
    tone: "white", hair: "show", top: -116, bottom: -98,
    draw: { front: nurse(0), quarter: nurse(-2), side: nurse(-6) },
  },
  hood: {
    tone: "white", hair: "hide", top: -114, bottom: 0,
    draw: { front: hood("front", HOOD_WIN.front, false), quarter: hood("quarter", HOOD_WIN.quarter, false), side: hood("side", HOOD_WIN.side, false) },
  },
  welder: {
    tone: "#333", hair: "hide", top: -114, bottom: 0,
    draw: { front: hood("front", WELD_WIN.front, true), quarter: hood("quarter", WELD_WIN.quarter, true), side: hood("side", WELD_WIN.side, true) },
  },
  welderUp: {
    tone: "#333", hair: "show", top: -122, bottom: -58,
    draw: { front: welderUp(0), quarter: welderUp(-2), side: welderUp(-4) },
  },
  helmet: {
    tone: "role", hair: "show", top: -116, bottom: -50,
    draw: {
      front: `<path d="M-58 -56C-60 -100 -32 -116 0 -116S60 -100 58 -56Z" FILL ${STROKE}/><path d="M-66 -60H66Q70 -58 68 -52Q66 -48 60 -48H-60Q-66 -48 -68 -52Q-70 -58 -66 -60Z" FILL ${STROKE}/><path d="M0 -114V-62" stroke="#000" stroke-width="3.5"/>`,
      quarter: `<path d="M-60 -56C-62 -98 -32 -116 4 -116C40 -116 62 -98 60 -60Z" FILL ${STROKE}/><path d="M-66 -60H76Q81 -59 79 -54Q77 -50 71 -50H-64Q-70 -50 -69 -55Q-69 -60 -66 -60Z" FILL ${STROKE}/><path d="M16 -114Q20 -90 18 -62" stroke="#000" stroke-width="3.5" fill="none"/>`,
      side: `<path d="M-62 -56C-64 -100 -30 -116 0 -116C36 -116 56 -98 56 -60Z" FILL ${STROKE}/><path d="M-68 -60H80Q85 -59 83 -54Q81 -50 75 -50H-66Q-72 -50 -71 -55Q-71 -60 -68 -60Z" FILL ${STROKE}/>`,
    },
  },
  cap: {
    tone: "role", hair: "show", top: -112, bottom: -50,
    draw: {
      front: `<path d="M-58 -58Q-60 -112 0 -112Q60 -112 58 -58Z" FILL ${STROKE}/><path d="M-62 -60H62Q60 -48 0 -48Q-60 -48 -62 -60Z" FILL ${STROKE}/>`,
      quarter: `<path d="M-60 -50Q-62 -112 -2 -112Q52 -112 58 -62H94V-50H-60Z" FILL ${STROKE}/>`,
      side: `<path d="M-62 -50Q-64 -112 -4 -112Q50 -112 56 -62H92V-50H-62Z" FILL ${STROKE}/>`,
    },
  },
  chef: {
    tone: "white", hair: "show", top: -158, bottom: -52,
    draw: { front: chef(0), quarter: chef(-1), side: chef(-4) },
  },
  chefLow: {
    tone: "white", hair: "show", top: -104, bottom: -52,
    draw: { front: chefLow(0), quarter: chefLow(-1), side: chefLow(-4) },
  },
  hygiene: {
    tone: "white", hair: "hide", top: -100, bottom: 0,
    draw: {
      front: `<path d="M-53 -40C-62 -106 62 -106 53 -40Q47 -36 41 -44Q0 -60 -41 -44Q-47 -36 -53 -40Z" FILL ${STROKE}/><path d="M-44 -50Q0 -66 44 -50" stroke="#000" stroke-width="3" fill="none"/>`,
      quarter: `<path d="M-57 -24C-70 -104 52 -112 51 -48Q46 -42 39 -48Q16 -62 -14 -56Q-32 -50 -40 -28Q-48 -18 -57 -24Z" FILL ${STROKE}/><path d="M-36 -40Q-24 -62 0 -62Q24 -62 40 -54" stroke="#000" stroke-width="3" fill="none"/>`,
      side: `<path d="M-60 -16C-74 -104 48 -112 47 -54Q42 -48 34 -54Q10 -64 -12 -56Q-28 -44 -34 -18Q-46 -6 -60 -16Z" FILL ${STROKE}/><path d="M-30 -38Q-16 -60 8 -62Q26 -62 36 -58" stroke="#000" stroke-width="3" fill="none"/>`,
    },
  },
};
/** かぶり物の明るさ */
export const headwearTone = (kind: HeadwearKind, role: CharacterRole) => {
  const t = HEADWEAR[kind].tone;
  return t === "role" ? ROLE_TONE[role] : t === "white" ? "#fff" : t;
};
export const headwearSvg = (kind: HeadwearKind, view: View, role: CharacterRole) =>
  HEADWEAR[kind].draw[view].replaceAll("FILL", `fill="${headwearTone(kind, role)}"`);

/** b の頭: 髪の後ろ → 顔 → 髪の前 → かぶり物。髪をしまうかぶり物のときは髪を描かない */
/** 髪の SVG。かぶり物をかぶると、お団子（back）とつやの線は描かない（お団子はかぶり物の中にしまう） */
// behind（後ろ髪・ポニーテールの尾）は胴より後ろに描くので、頭とは別に返す。縁より下に垂れる髪なので、髪を見せるかぶり物では残す。
// sx は顔の幅に合わせた髪の横の倍率（avatar.ts の hairScale）。1 のときは今までと同じ文字列
// skin はスキンヘッドとソフトモヒカンの頭の丸みの色
export const hairSvg = (view: View, hair: Hair, headwear: HeadwearKind | "none", sx = 1, skin = "#fff") => {
  if (headwear !== "none" && (HEADWEAR[headwear].hair === "hide" || hair === "skinhead")) return { back: "", front: "", behind: "" };
  const bare = headwear === "none";
  const traced = bare && hair !== "bob" ? TRACED[hair][view] : undefined;
  const h: { back?: string; front: string; gloss?: string } = traced ?? HAIR_B[(bare ? hair : (UNDER_HAT[hair] ?? hair)) as HandHair][view];
  const fill = HAIR_FILL[hair] ?? "#000";
  const gloss = bare && h.gloss ? `<path d="${h.gloss}" fill="none" stroke="#777" stroke-width="3" stroke-linecap="round"/>` : "";
  const body = h.front.startsWith("<") ? h.front.replaceAll("HAIRFILL", fill).replaceAll("SKINFILL", skin) : `<path d="${h.front}" fill="${fill}" stroke="#000" stroke-width="4.5" stroke-linejoin="round"/>`;
  const front = body + gloss;
  const behindSrc = (hair === "bob" ? HAIR_B.bob : TRACED[hair])[view].behind;
  // 手で塗り直した髪は絵に縁まで入っているので、縁取りを足さない（足すと前の層との切れ目に線が出る）
  const behind = !behindSrc ? "" : hair === "bob" ? `<path d="${behindSrc}" fill="${fill}" stroke="#000" stroke-width="4.5" stroke-linejoin="round"/>` : `<path d="${behindSrc}" fill="${fill}"/>`;
  const fit = (s: string) => (sx === 1 || !s ? s : `<g transform="scale(${sx} 1)">${s}</g>`);
  return { back: fit(bare ? (h.back ?? "") : ""), front: fit(front), behind: fit(behind) };
};
// 顔の部品と、顔に付く部品（マスク・耳当て・顔の覆い）は、顔の幅の倍率 k で横の位置を合わせる。描く順: 髪の後ろ → 顔 → マスク → 眼鏡 → 髪の前 → かぶり物
const headB = (view: View, hair: Hair, headwear: HeadwearKind | "none", role: CharacterRole, o: Outfit, f: FaceParts) => {
  const h = hairSvg(view, hair, headwear, hairScale(f.face), SKIN_TONE[f.skin]);
  const k = faceHalfWidth(f.face) / 45;
  const hat = headwear === "none" ? "" : headwearSvg(headwear, view, role) +
    headMarks(headwear, view, o, headwearTone(headwear, role));
  // 耳はどの髪でも髪の前の層の上に描く
  const ears = earsSvg(view, f);
  return `${h.back}${faceSvg(view, f)}${o.mask ? maskSvg(view, k) : ""}${glassesSvg(view, f)}${h.front}${ears}${hat}${o.ears ? earSvg(view, o.ears, k) : ""}${o.visor ? visorSvg(view, o.visor, k) : ""}`;
};

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
const neckB = (skin: string) => (skin === "#fff" ? NECK_B : NECK_B.replace('fill="#fff"', `fill="${skin}"`));
const neckShift = (deg: number) => Math.sin((deg * Math.PI) / 180) * 10;
/**
 * 首の横の位置。斜めは胸が向く側へ寄せ、服の中心の線（襟の V のまん中、x 10）に合わせる（奥の肩の方が首に近く見える）。
 * 真横も同じで、首は胴のまん中より少し前（x 6）に立ち、ベストの V（VEST_V.side のまん中 6）と服の襟のまん中（outfit.ts の CX.side）をここにそろえる。
 * 首を 0 のままにすると、襟の開きが首の前へずれて浮いて見えた
 */
// 斜めは服の中心の線（10）に合わせると頭が前へ出すぎて見えたので、少し戻して 6 にする（11/3 作者の確認）
const NECK_X: Record<View, number> = { front: 0, quarter: 6, side: 6 };

/** いちばん低い点（靴底・ひざ・手・頭）の腰からの高さ。地面に置くのに使う */
function lowest(a: Angles, view: View, look: Look, top: number): number {
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
  const head = mul(mul(mul(torso, T(NECK_X[view] + neckShift(r.neck), -142 - L.headUp - NECK_LEN[look] - NECK_PIVOT)), R(r.neck)), T(0, NECK_PIVOT));
  ys.push(at(head, 0, 0), at(head, 0, top));
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
  const role = c.role ?? "new";
  const headwear = c.headwear ?? (look === "a" ? "cap" : "none");
  const hair = c.hair ?? "bob";
  const f: FaceParts = { ...DEFAULT_FACE, ...c.face };
  const skin = SKIN_TONE[f.skin];
  const top = headwear === "none" ? (HAIR_TOP[hair] ?? -92) : HEADWEAR[headwear].top;
  const low = lowest(c.angles, view, look, top);
  const o = c.outfit ?? {};
  const sleeve = o.sleeve ?? cloth.arm;
  // 手足は 1 本ごとに 2 回描く: まず全部の段の縁（黒）、次に全部の段の中身（灰色）。
  // 段ごとに縁と中身を描くと、下の段の縁が上の段の中身に重なって関節の線（ロボットのような区切り）が出る。
  // 2 回に分けると、ひじ・ひざの内側の縁は中身に埋もれて消え、外まわりの縁だけが 1 本につながる
  const leg = (i: number) => {
    const g = r.legs[i];
    // 正面は両足ともカメラから同じ遠さなので、同じ明るさにする
    const far = i === 0 && view !== "front";
    const fill = o.pants ? (far ? farTone(o.pants) : o.pants) : far ? cloth.legFar : cloth.leg;
    const shoeFill = o.boots ? (far ? farTone(o.boots) : o.boots) : far ? cloth.shoeFar : cloth.shoe;
    const boot = o.boots ? bootSvg(L.shin, shoeFill) : "";
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].leg[i]} 0)${rot(g.thigh)}">${seg(L.thigh, 40, pass, fill)}<g transform="translate(0 ${L.thigh})${rot(g.shin)}">${seg(L.shin, 40, pass, fill)}${pass === "fill" ? `${boot}<g transform="translate(0 ${L.shin})">${view === "front" ? shoeFront(i, g.ankle, shoeFill) : shoe(g.ankle, shoeFill)}</g>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  /** spot: 0 が奥の腕（far）、1 が手前の腕（near） */
  const arm = (spot: number) => {
    const g = r.arms[spot];
    const chain = (pass: Pass) =>
      `<g transform="translate(${SPOT[view].arm[spot]} ${-142 + L.shoulderDrop})${rot(g.upper)}">${seg(L.upperArm, 32, pass, sleeve)}${pass === "fill" && spot === 1 && o.armband ? armbandSvg(sleeve) : ""}<g transform="translate(0 ${L.upperArm})${rot(g.lower)}">${seg(L.lowerArm, 32, pass, sleeve)}${pass === "fill" && o.cuffs ? cuffSvg(o.cuffs, L.lowerArm, sleeve) : ""}${pass === "fill" ? `<circle cy="${L.lowerArm}" r="15" fill="${o.gloves ?? (look === "b" && cloth.hand === "#fff" ? skin : cloth.hand)}" stroke="#000" stroke-width="5"/>` : ""}</g></g>`;
    return chain("edge") + chain("fill");
  };
  const headAt = (inner: string) =>
    `<g transform="translate(${n(NECK_X[view] + neckShift(r.neck))} ${-142 - L.headUp - NECK_LEN[look] - NECK_PIVOT})${rot(r.neck)} translate(0 ${NECK_PIVOT})">${inner}</g>`;
  const head = headAt(look === "a" ? HEAD[view] + (headwear === "none" ? "" : headwearSvg(headwear, view, role)) : headB(view, hair, headwear, role, o, f));
  // 首は胴より先に描き、付け根を胴の襟の下に隠す（胴の上に描くと首の下の縁が見えて、首が切れて見える）
  const neck = look === "b" ? headAt(neckB(skin)) : "";
  // 後ろ髪（ロング・ポニーテールの尾）は首と胴より後ろ。首の回転と同じ変換で頭に付いてくる
  const behind = look === "b" ? hairSvg(view, hair, headwear).behind : "";
  // 描く順: 奥の腕 → 奥の足 → 手前の足 → 首 → 胴 → 頭 → 手前の腕。正面は両腕とも体の前（胴と頭のあと）に描く。
  // 手前の腕は頭より上へ挙げても、頭と顔より前に描く（顔の前に手をかざす・頭の上へ挙げるとき、手前の腕は頭よりこちら側にある）
  const body0 = torso(view, look) + outfitTorso(view, o);
  const front = view === "front";
  const upper = `${behind ? headAt(behind) : ""}${neck}${body0}${head}${front ? arm(0) : ""}${arm(1)}`;
  const body = `<g transform="rotate(${n(r.torso)})">${front ? "" : arm(0)}</g>${leg(0)}${leg(1)}<g transform="rotate(${n(r.torso)})">${upper}</g>`;
  return `<g data-part="figure" transform="translate(${n(c.x)} ${n(c.groundY - low * k)}) scale(${(d * k).toFixed(4)} ${k.toFixed(4)})">${body}</g>`;
}
