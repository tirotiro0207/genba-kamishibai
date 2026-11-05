// キャラクターを作る画面で選ぶ顔の部品（製品仕様 §14）。輪郭・目・まつげ・眉・口・眼鏡・ひげ・肌の明るさ。
// 顔の輪郭は 3 つの向きで同じ形のままにして、向きの違いは目・鼻・口の位置だけで出す（輪郭を向きごとに変えると、輪郭の種類 × 向きで崩れる）。
// 顔に付く部品の横の位置は、全部 landmarks()（向きごとの目印）から取る。マスクを x 0 に決め打ちして、斜めで顔のまん中からずれた失敗をくり返さないため。
// 目印の数は、初めの顔（standard、半幅 45）の値を 45 で割った係数に顔の半幅を掛けたもの。standard では今までの絵と 1 文字も変わらない。
import type { View } from "./character";

export type FaceShape = "standard" | "round" | "slim" | "square";
/** white（白目に大きな黒目）は動画だけの特別な目。キャラクターを作る画面の選択肢（FACE_OPTIONS）には入れない */
export type EyeShape = "oval" | "round" | "slit" | "up" | "down" | "white";
export type EyeSize = "s" | "m" | "l";
/** 輪郭の大きさ（11/5 作者。キャラクターを作る画面の「小 ━━ 大」のつまみ）。m は今までの絵と 1 文字も変わらない */
export type PartSize = "s" | "m" | "l";
/** threeCenter は案内人（動画だけのキャラ）のための形。キャラクターを作る画面の選択肢には出さない */
export type Lashes = "none" | "flick" | "three" | "threeCenter";
export type Brows = "none" | "flat" | "arch" | "angled";
/**
 * 表情（場面ごとに描く側が選ぶ。キャラクターを作る画面では選ばない）。口はキャラクターの部品にせず、表情と話す口で決める。
 * neutral は今までの笑った口の顔と 1 文字も変わらない
 */
/**
 * serious（真剣）は 11/6 作者の指示で足した。眉は短い直線で、ふつうの眉の高さのまま鼻の側を少し下げる（傾き約 18°。怒りは低く急）。
 * 口は横にまっすぐ結ぶ。目は変えない（11/6 作り直し: 眉が目に近く低いと、にらんで見えた）
 */
export type Expression = "neutral" | "joy" | "fun" | "anger" | "sad" | "surprise" | "worry" | "pain" | "serious";
export const EXPRESSIONS: readonly Expression[] = ["neutral", "joy", "fun", "anger", "sad", "surprise", "worry", "pain", "serious"];
/** 話している口の形（あ・い・う・え・お）。表情の口より先に使う */
export type Vowel = "a" | "i" | "u" | "e" | "o";
export const VOWELS: readonly Vowel[] = ["a", "i", "u", "e", "o"];
/** eyes: 目だけ別の表情にする（横になる姿勢で目を閉じた痛い目にするのに使う。11/6）。無ければ expression の目 */
export interface Mood { expression?: Expression; speak?: Vowel; eyes?: Expression }
export type Glasses = "none" | "round" | "square";
export type Skin = "white" | "light";
/** stubble（口の周りからあごまでの薄い灰の面）は動画だけの特別なひげ。キャラクターを作る画面の選択肢には入れない */
export type Beard = "none" | "mustache" | "stubble";

/** 顔の部品の選び方。髪は CharacterSpec.hair（または avatar.hair）で選ぶ */
export interface FaceParts {
  face: FaceShape;
  faceSize: PartSize;
  eyeShape: EyeShape;
  eyeSize: EyeSize;
  lashes: Lashes;
  brows: Brows;
  glasses: Glasses;
  skin: Skin;
  beard: Beard;
}
export const DEFAULT_FACE: FaceParts = {
  face: "standard", faceSize: "m", eyeShape: "oval", eyeSize: "m", lashes: "none", brows: "none", glasses: "none", skin: "white", beard: "none",
};
export const FACE_OPTIONS = {
  face: ["standard", "round", "slim", "square"],
  faceSize: ["s", "m", "l"],
  eyeShape: ["oval", "round", "slit", "up", "down"],
  eyeSize: ["s", "m", "l"],
  lashes: ["none", "flick", "three"],
  brows: ["none", "flat", "arch", "angled"],
  glasses: ["none", "round", "square"],
  skin: ["white", "light"],
  beard: ["none", "mustache"],
} as const satisfies { [K in keyof FaceParts]: readonly FaceParts[K][] };

const n = (v: number) => String(Math.round(v * 10) / 10);
export const SKIN_TONE: Record<Skin, string> = { white: "#fff", light: "#e6e6e6" };

/** 輪郭の 3 つの数: 半幅 w（ほお）・上の平らの半幅 t・あごの平らの半幅 c。高さ 70 は変えない（首・かぶり物・マスクの高さを動かさない） */
const FACE_DIM: Record<FaceShape, [number, number, number]> = {
  standard: [45, 18, 12],
  // 違いが小さな絵でも分かるよう、角の丸み（上下のまっすぐな辺の長さ）を大きく変える
  round: [46, 6, 6],
  slim: [41, 14, 4],
  square: [45, 30, 28],
};
/** 輪郭の大きさの横の倍率（高さは変えない） */
const FACE_SCALE: Record<PartSize, number> = { s: 0.9, m: 1, l: 1.1 };
/** 口の大きさの倍率（横の幅と、すぼめた口の丸） */
const dim = (face: FaceShape, size: PartSize = "m") => FACE_DIM[face].map((v) => v * FACE_SCALE[size]) as [number, number, number];
export const faceHalfWidth = (face: FaceShape, size: PartSize = "m") => dim(face, size)[0];
/** 髪の横の倍率（顔の幅に合わせて髪を横だけ伸び縮みさせる。髪の形は半幅 45 の顔で 1 回だけ描く） */
export const hairScale = (face: FaceShape, size: PartSize = "m") => (faceHalfWidth(face, size) + 4) / 49;
export const faceOutline = (face: FaceShape, size: PartSize = "m") => {
  const [w, t, c] = dim(face, size);
  return `M${n(-t)} -70H${n(t)}Q${n(w - 1)} -70 ${n(w - 0.4)} -48L${n(w + 0.4)} -30Q${n(w)} 0 ${n(c)} 0H${n(-c)}Q${n(-w + 0.4)} 0.4 ${n(-w)} -30L${n(-w + 0.6)} -48Q${n(-w + 1)} -70 ${n(-t)} -70Z`;
};

/** 向きごとの目印（standard の値。k ＝ 半幅 / 45 を掛けて使う） */
const MARK: Record<View, {
  eyes: number[]; out: number[]; nose: [number, number, number]; mouth: [number, number, number];
}> = {
  // eyes: 目の中心の x。out: その目の目尻の向き（−1 は画面の左）。nose: x・y・半径。mouth: 中心・半幅・笑いの線の下がり（制御点の y）
  front: { eyes: [-14, 14], out: [-1, 1], nose: [0, -25, 2], mouth: [0, 7, -10.5] },
  quarter: { eyes: [8, 30], out: [-1, 1], nose: [21, -25, 2], mouth: [20, 6.5, -10.5] },
  side: { eyes: [27], out: [1], nose: [37, -27, 2.2], mouth: [32.5, 4, -11.5] },
};
/** 耳の目印（マスクの紐の先）。正面は左右の耳の付け根の少し外、斜めは見える耳（後ろ寄り）と奥の顔の縁、真横は見える耳 */
export const EAR_MARK: Record<View, number[]> = { front: [-47, 47], quarter: [-35, 44], side: [-5] };
/** 耳の上と下の端（目の高さ −42 から鼻の下 −22 まで） */
export const EAR_TOP = -42, EAR_BOTTOM = -22;

export interface Landmarks {
  w: number;
  k: number;
  eyes: { x: number; out: number; far: boolean }[];
  nose: [number, number, number];
  mouth: { cx: number; hw: number; ctrl: number };
  ears: number[];
}
export const landmarks = (face: FaceShape, view: View, size: PartSize = "m"): Landmarks => {
  const w = faceHalfWidth(face, size), k = w / 45, m = MARK[view];
  return {
    w, k,
    eyes: m.eyes.map((x, i) => ({ x: x * k, out: m.out[i], far: view === "quarter" && i === 0 })),
    nose: [m.nose[0] * k, m.nose[1], m.nose[2]],
    mouth: { cx: m.mouth[0] * k, hw: m.mouth[1] * k, ctrl: m.mouth[2] },
    ears: EAR_MARK[view].map((x) => x * k),
  };
};

const EYE_SIZE: Record<EyeSize, [number, number]> = { s: [3.8, 4.8], m: [4.6, 5.8], l: [5.5, 7] };
const EYE_Y = -37;
const WHITE_DROP = 3;
const line = (d: string, w = 3.5) => `<path d="${d}" stroke="#000" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

/** 目 1 つ（まつげを含む）。つり目・たれ目は目尻の側を上げ下げする向きに 12° 回す */
const eyeSvg = (e: Landmarks["eyes"][number], p: FaceParts, view: View, ex: Expression = "neutral") => {
  const [rx, ry] = EYE_SIZE[p.eyeSize];
  const cx = n(e.x);
  // 喜ぶ: 目を閉じて上へ丸い弧（^）。痛い: 目をぎゅっと閉じた「＞ ＜」（くの字の先が鼻の側）
  if (ex === "joy") return line(`M${n(e.x - rx - 1)} ${EYE_Y + 2}Q${cx} ${n(EYE_Y - ry * 1.5)} ${n(e.x + rx + 1)} ${EYE_Y + 2}`);
  if (ex === "pain") {
    const tip = e.x - e.out * (rx + 1), back = e.x + e.out * (rx + 1);
    return line(`M${n(back)} ${n(EYE_Y - ry * 0.8)}L${n(tip)} ${EYE_Y}L${n(back)} ${n(EYE_Y + ry * 0.8)}`);
  }
  let body: string;
  // 驚く: どの目の形でも、まるく少し大きく見開く
  if (ex === "surprise") body = `<circle cx="${cx}" cy="${EYE_Y}" r="${n(ry * 1.05)}"/>`;
  else if (p.eyeShape === "round") body = `<circle cx="${cx}" cy="${EYE_Y}" r="${n(ry * 0.9)}"/>`;
  else if (p.eyeShape === "slit") {
    // 糸目は線 1 本。真横は鼻の点と見分けがつくよう、1.3 倍に長くして少し前上がりにする
    const half = ((2 * rx + 2) / 2) * (view === "side" ? 1.3 : 1);
    body = line(`M${n(e.x - half)} ${EYE_Y}H${n(e.x + half)}`);
    if (view === "side") body = `<g transform="rotate(-8 ${cx} ${EYE_Y})">${body}</g>`;
  } else if (p.eyeShape === "white") {
    // 白目は横に 2.3 倍の幅（見本の目は顔の幅の 4 分の 1 ほど）。黒目は顔の向く側へ少し寄せる（正面は真ん中）。斜めの奥の目は細く
    const wx = rx * 2.3 * (e.far ? 0.8 : 1), px = e.x + (view === "front" ? 0 : (view === "side" ? 3 : 2) * (e.far ? 0.6 : 1));
    // 白目は 3 下げる（前髪の下の縁と白目の間を空け、まん中のまつげが前髪に隠れないようにする。白目は案内人だけの形）
    const ey = EYE_Y + WHITE_DROP;
    body = `<ellipse cx="${cx}" cy="${ey}" rx="${n(wx)}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="2.5"/>` +
      `<circle cx="${n(px)}" cy="${ey}" r="${n(ry * 0.75)}"/>`;
    return body + lashSvg(e, wx, ry, p.lashes, ey);
  } else body = `<ellipse cx="${cx}" cy="${EYE_Y}" rx="${rx}" ry="${ry}"/>`;
  const lashes = lashSvg(e, rx, ry, p.lashes);
  // 目尻は out の側。SVG の回転は時計回りが正で、正の回転は画面の左の端を持ち上げる。つり目は目尻を上げる
  const tilt = p.eyeShape === "up" ? -e.out * 12 : p.eyeShape === "down" ? e.out * 12 : 0;
  return tilt ? `<g transform="rotate(${tilt} ${cx} ${EYE_Y})">${body}${lashes}</g>` : body + lashes;
};
/** まつげ。目尻の上の縁から外上へ。斜めの奥の目は回り込んで見えにくいので、短く・本数を減らす */
const lashSvg = (e: Landmarks["eyes"][number], rx: number, ry: number, kind: Lashes, ey = EYE_Y) => {
  if (kind === "none") return "";
  // 目の上のまん中に 3 本、扇のように上へ（案内人の見本の顔。three の形は変えない）。斜めの奥の目は短く
  if (kind === "threeCenter") {
    const len = ry * 0.75 * (e.far ? 0.6 : 1);
    return [-1, 0, 1].map((i) => {
      const x0 = e.x + i * rx * 0.32, y0 = ey - ry * Math.sqrt(1 - (i * 0.32) ** 2);
      const r = ((90 - i * 25) * Math.PI) / 180;
      return line(`M${n(x0)} ${n(y0)}L${n(x0 + len * Math.cos(r))} ${n(y0 - len * Math.sin(r))}`, 2.5);
    }).join("");
  }
  const angles = kind === "flick" ? [35] : e.far ? [45, 70] : [20, 45, 70];
  const len = ry * (kind === "flick" ? 1.3 : 0.9) * (e.far ? 0.6 : 1);
  const bx = e.x + e.out * rx * Math.cos(Math.PI / 6), by = ey - ry * Math.sin(Math.PI / 6);
  return angles.map((a) => {
    const r = (a * Math.PI) / 180;
    return line(`M${n(bx)} ${n(by)}L${n(bx + e.out * len * Math.cos(r))} ${n(by - len * Math.sin(r))}`, kind === "flick" ? 3 : 2.5);
  }).join("");
};
/** 眉（y −48）。斜めは両方を少し短く（顔が回り込む）、真横は 1 本で前へ長く。上の端は前髪の下の縁（−53 前後）より下に収める */
/**
 * 表情の眉。眉を選んでいなくても描く（怒り・悲しみは眉が無いと読めない）。
 * [鼻の側の端の y, 外の端の y]。怒りは鼻の側を下げ、悲しみ・困る・痛いは鼻の側を上げ、驚きは全体を上げる
 */
const MOOD_BROW: Partial<Record<Expression, [number, number]>> = {
  anger: [-43.5, -50], serious: [-47, -51.5], sad: [-51, -45.5], worry: [-51, -46], pain: [-50, -45], surprise: [-52, -52],
};
const browSvg = (lm: Landmarks, kind: Brows, view: View, ex: Expression = "neutral") => {
  const mb = MOOD_BROW[ex];
  if (mb) {
    const h = 7 * lm.k * (view === "quarter" ? 0.8 : 1);
    return lm.eyes.map((e) => {
      const [a, b] = view === "side" ? [e.x - 4 * lm.k, e.x + 8 * lm.k] : [e.x - h, e.x + h];
      // 真横は鼻の側が前（b）。正面・斜めは目尻の反対側
      const inner = view === "side" ? b : e.out > 0 ? a : b, outer = view === "side" ? a : e.out > 0 ? b : a;
      if (ex === "surprise") return line(`M${n(a)} -49Q${n((a + b) / 2)} -54 ${n(b)} -49`);
      return line(`M${n(inner)} ${mb[0]}L${n(outer)} ${mb[1]}`, 4);
    }).join("");
  }
  if (kind === "none") return "";
  const h0 = 7 * lm.k;
  return lm.eyes.map((e) => {
    // つり眉は線が太いので、斜めではもう少し詰めて手前の目尻側を横の房から離す
    const h = h0 * (view === "quarter" ? (kind === "angled" ? 0.7 : 0.8) : 1);
    const [a, b] = view === "side" ? [e.x - 4 * lm.k, e.x + 8 * lm.k] : [e.x - h, e.x + h];
    const inner = e.out > 0 ? a : b, outer = e.out > 0 ? b : a;
    if (kind === "flat") return line(`M${n(a)} -48H${n(b)}`);
    if (kind === "arch") return line(`M${n(a)} -46Q${n((a + b) / 2)} -50 ${n(b)} -46`);
    return line(`M${n(inner)} -46L${n(outer)} -48.5`, 4);
  }).join("");
};
/**
 * 口。話している口（あいうえお）があればそれ、無ければ表情の口。口の中は黒く塗る。
 * 口の角の高さ −16 と、笑いの線の下がり（ctrl）は向きごとの目印から
 */
const mouthSvg = (lm: Landmarks, mood: Mood = {}) => {
  const { cx, ctrl, hw } = lm.mouth;
  const fillPath = (d: string) => `<path d="${d}" fill="#000" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>`;
  const hole = (rx: number, ry: number, cy = -14) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="#000" stroke="#000" stroke-width="2"/>`;
  switch (mood.speak) {
    case "a": return hole(hw * 0.9, 6.5, -12.5); // 縦にも横にも大きく
    case "i": return hole(hw * 1.1, 2.6, -14.5); // 横に引いて、すき間は細く
    case "u": return hole(Math.max(2.2, hw * 0.32), 3, -14); // すぼめて小さく丸く
    case "e": return hole(hw * 1.05, 4.2, -14); // 横に広く、あより低い
    case "o": return hole(hw * 0.6, 5.8, -13); // 縦長の丸
  }
  switch (mood.expression ?? "neutral") {
    case "joy": case "fun": {
      // 口を開けて笑う（上は平ら、下は丸い）
      const w = hw * 1.2;
      return fillPath(`M${n(cx - w)} -17Q${n(cx)} -18 ${n(cx + w)} -17Q${n(cx + w * 0.7)} -6 ${n(cx)} -6Q${n(cx - w * 0.7)} -6 ${n(cx - w)} -17Z`);
    }
    case "anger": {
      // どなる口: 横に広く、口の角が下がった四角に近い形
      const w = hw * 1.25;
      return fillPath(`M${n(cx - w)} -13Q${n(cx)} -19 ${n(cx + w)} -13L${n(cx + w * 0.6)} -6.5Q${n(cx)} -8 ${n(cx - w * 0.6)} -6.5Z`);
    }
    case "sad": return line(`M${n(cx - hw)} -10Q${n(cx)} -17 ${n(cx + hw)} -10`); // への字
    case "serious": return line(`M${n(cx - hw * 0.8)} -14.5H${n(cx + hw * 0.8)}`); // 口を横にまっすぐ結ぶ
    case "surprise": return hole(Math.max(2.5, hw * 0.45), 4.5, -13); // 小さい「お」
    case "worry": {
      // 波の口
      const q = hw / 2;
      return line(`M${n(cx - hw)} -13Q${n(cx - q)} -16 ${n(cx)} -13T${n(cx + hw)} -13`);
    }
    case "pain": {
      // 歯を食いしばる: 横長の口に、歯の境目の線
      const w = hw * 1.05;
      return `<path d="M${n(cx - w)} -16H${n(cx + w)}V-10H${n(cx - w)}Z" fill="#fff" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>` + line(`M${n(cx - w)} -13H${n(cx + w)}`, 2);
    }
    default: return line(`M${n(cx - hw)} -16Q${n(cx)} ${ctrl} ${n(cx + hw)} -16`);
  }
};
const beardSvg = (lm: Landmarks, kind: Beard) => {
  const hw = lm.mouth.hw;
  return kind === "none" || kind === "stubble" ? "" : line(`M${n(lm.mouth.cx - hw - 2 * lm.k)} -19Q${n(lm.mouth.cx)} -21 ${n(lm.mouth.cx + hw + 2 * lm.k)} -19`, 3.5);
};

/**
 * 耳（髪の前の層の上・かぶり物の下に描く。マスクの紐と眼鏡の蔓は耳の下へ入る）。
 * 正面は顔の縁から外へ出た半分だけを描く。斜めは奥へ回った見える耳 1 つ、真横は頭の真ん中の耳 1 つで、穴の向きは顔の向く側
 */
export const earsSvg = (view: View, p: FaceParts) => {
  const { w, k } = landmarks(p.face, view, p.faceSize);
  const skin = SKIN_TONE[p.skin];
  const ink = (d: string) => `<path d="${d}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>`;
  if (view === "front") return [-1, 1].map((s) => {
    const x = (d: number) => n(s * (w + d));
    return `<path d="M${x(-1)} ${EAR_TOP}Q${x(11)} ${EAR_TOP - 4} ${x(10)} -32Q${x(10)} ${EAR_BOTTOM + 2} ${x(-1)} ${EAR_BOTTOM}Z" fill="${skin}" stroke="#000" stroke-width="4" stroke-linejoin="round"/>` +
      ink(`M${x(3)} -38Q${x(7)} -34 ${x(3.5)} -27`);
  }).join("");
  const cx = EAR_MARK[view][0] * k, rx = view === "side" ? 6.5 : 6;
  // 斜め・真横は C の字: 顔にくっつく前の 3 分の 1 には線を引かない（塗りは弦で閉じ、線は後ろの弧だけ）
  const ex = n(cx + rx / 2), arc = `M${ex} -40.7A${rx} 10 0 1 0 ${ex} -23.3`;
  return `<path d="${arc}Z" fill="${skin}"/><path d="${arc}" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>` +
    ink(`M${n(cx + 2.5)} -37Q${n(cx - 2.5)} -37 ${n(cx - 2)} -31Q${n(cx - 1.5)} -27 ${n(cx + 2)} -26`);
};

/**
 * 薄いひげ（stubble）。鼻の下（y −22）からあごまでを薄い灰（#ccc）で塗り、口の両わきのほおだけを肌の色に抜く（口の周りの逆 U と、顔の縁の細い帯が残る）。
 * ほおの下の縁は 2 つのふくらみ。顔の輪郭で切り抜き、輪郭の線を上から引き直す。口は灰の上に描く。線は描かない
 */
const stubbleSvg = (p: FaceParts, lm: Landmarks) => {
  const outline = faceOutline(p.face, p.faceSize), id = `stubble-${p.face}-${p.faceSize}`;
  const cx = lm.mouth.cx, k = lm.k;
  const cheeks = [-1, 1].map((sd) => {
    const i = cx + sd * 14 * k, o = sd * (lm.w - 7 * k);
    if (sd * (o - i) < 5) return "";
    const a = (i + o) / 2;
    return `M${n(i)} -23V-16C${n(i)} -11 ${n(a)} -11 ${n(a)} -14C${n(a)} -11 ${n(o)} -11 ${n(o)} -16V-23Z`;
  }).join("");
  return `<defs><clipPath id="${id}"><path d="${outline}"/></clipPath></defs><g clip-path="url(#${id})">` +
    `<rect x="-60" y="-22" width="120" height="30" fill="#ccc"/>` + (cheeks ? `<path d="${cheeks}" fill="${SKIN_TONE[p.skin]}"/>` : "") + `</g>` +
    `<path d="${outline}" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round"/>`;
};

/** 正面でうつむく・見上げるときに、顔の部品を上下にずらす（輪郭はそのまま）。0 のときは何も足さない */
const shiftY = (svg: string, dy: number) => (dy && svg ? `<g transform="translate(0 ${dy})">${svg}</g>` : svg);
/**
 * 顔（輪郭・目・まつげ・眉・鼻・口・ひげ）。初めの値は今までの FACE_B と同じ文字列になる。tilt は顔の部品を下へずらす量。
 * mood は表情と話す口（無ければふつうの笑った口）
 */
export const faceSvg = (view: View, p: FaceParts, tilt = 0, mood: Mood = {}) => {
  const ex = mood.expression ?? "neutral";
  const lm = landmarks(p.face, view, p.faceSize);
  const [nx, ny, nr] = lm.nose;
  return `<path d="${faceOutline(p.face, p.faceSize)}" fill="${SKIN_TONE[p.skin]}" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
    (p.beard === "stubble" ? stubbleSvg(p, lm) : "") +
    shiftY(lm.eyes.map((e) => eyeSvg(e, p, view, mood.eyes ?? ex)).join("") + browSvg(lm, p.brows, view, ex) +
    `<circle cx="${n(nx)}" cy="${ny}" r="${nr}"/>` + mouthSvg(lm, mood) + beardSvg(lm, p.beard), tilt);
};

/** 眼鏡（マスクより上、髪の前の層より下に描く）。斜めの奥のレンズは細く、蔓は見える耳へ 1 本 */
export const glassesSvg = (view: View, p: FaceParts, tilt = 0): string => {
  if (p.glasses === "none") return "";
  if (tilt) return shiftY(glassesSvg(view, p), tilt);
  const lm = landmarks(p.face, view, p.faceSize);
  const r = EYE_SIZE[p.eyeSize][1] + 3.5;
  const lens = (x: number, sx: number) => p.glasses === "round"
    ? `<ellipse cx="${n(x)}" cy="${EYE_Y}" rx="${n(r * sx)}" ry="${n(r)}" fill="none" stroke="#000" stroke-width="3"/>`
    : `<rect x="${n(x - r * sx)}" y="${n(EYE_Y - r)}" width="${n(2 * r * sx)}" height="${n(2 * r)}" rx="2" fill="none" stroke="#000" stroke-width="3"/>`;
  const sx = lm.eyes.map((e) => (e.far ? 0.8 : 1));
  const lenses = lm.eyes.map((e, i) => lens(e.x, sx[i])).join("");
  if (view === "front") return lenses + line(`M${n(lm.eyes[0].x + r)} ${EYE_Y}H${n(lm.eyes[1].x - r)}`, 3);
  if (view === "quarter") {
    const [f, near] = lm.eyes;
    return lenses + line(`M${n(f.x + r * sx[0])} ${EYE_Y}H${n(near.x - r)}`, 3) + line(`M${n(f.x - r * sx[0])} ${EYE_Y}L${n(-(lm.w - 1))} -40`, 3);
  }
  return lenses + line(`M${n(lm.eyes[0].x - r)} ${EYE_Y}L${n(-8 * lm.k)} -40`, 3);
};
