// 入口の背景のカードに描く顔（11/5 作者）。人形の部品（髪・かぶり物・目・まつ毛・口など）を乱数で組み、胸から上を正方形に切り抜く。
// 色は 11/5 の作者の直し: 黒い線と黒い塗りだけにカードの色を付け、ほかは全部白で抜く（カードの地も白）。
// 1 人ごとに線だけのマスクの PNG に焼き、カードの側で色を付ける（下の「速さの直し」）
import { nextCombo, randomFace } from "./avatar-pick";
import { characterSvg } from "../../shared/picto/character";
import { STANDING } from "../../shared/picto/skeleton";


/** 胸から上の正方形（人形の背の高さ 434 で描いたときの頭まわり） */
const VIEW = "-100 -45 200 200";

/** 色の明るさ（0〜1）。#rgb と #rrggbb */
function lightness(hex: string): number {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** 暗い色（線・黒い塗り・濃い灰色のかぶり物）だけを線の色に、ほかの色（灰色の服・肌・白）は白にする */
const DARK = 0.3;
const recolor = (svg: string, line: string) => svg.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (c) => (lightness(c) < DARK ? line : "#fff"));

/**
 * 今出している人の窓（WINDOW 人）。全業種の役 × 髪形の掛け合わせ（1,600 近く。avatar-pick.ts）を順に入れ替えて出す。
 * REFRESH の割合で窓の 1 人を次の掛け合わせに替えるので、時間がたてば全部の掛け合わせが出る。
 *
 * 速さの直し（11/5 に測った）: 服まで描いた SVG の画像を 240 枚並べて回すと、回る途中で大きさが変わるたびに SVG を描き直し、
 * 流れが 1 秒 1 コマまで落ちた。CSS のマスクで色を付ける形でも 1 秒 35 コマだった。
 * そこで 1 人ごとに 1 回だけ白で描いて画素ごとの線の濃さを取り出し、人と色の組ごとに MASK_PX 角の PNG に焼いて、ふつうの画像で出す。
 * 白の塗りの重なりは焼く前に決まっているので、後ろの線は透けない。PNG は MASK_MAX 枚まで覚え、古いものから捨てる（捨てるときに URL を返す）
 */
const WINDOW = 80;
const REFRESH = 0.25;
const MASK_PX = 192;
const MASK_MAX = 400;

interface Person {
  id: number;
  /** 線の濃さ（0〜255）を画素ごとに持つ。焼き上がるまでは待つ */
  alpha: Promise<Uint8ClampedArray>;
}
let seq = 0;

/** 白で描いた SVG から、画素ごとの線の濃さ（線 = 255・白 = 0）を取り出す */
async function bake(svg: string): Promise<Uint8ClampedArray> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = cv.height = MASK_PX;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, MASK_PX, MASK_PX);
  const px = ctx.getImageData(0, 0, MASK_PX, MASK_PX).data;
  const a = new Uint8ClampedArray(MASK_PX * MASK_PX);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) a[j] = px[i + 3] * (1 - (px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722) / 255);
  return a;
}

const pngs = new Map<string, Promise<string>>();
/** 線の濃さに色を付けた PNG（object URL）。人と色の組ごとに MASK_MAX 枚まで覚え、古いものから捨てる */
function colored(p: Person, color: string): Promise<string> {
  const key = `${p.id}:${color}`;
  let u = pngs.get(key);
  if (u) return u;
  u = p.alpha.then(async (a) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = MASK_PX;
    const ctx = cv.getContext("2d")!;
    const d = ctx.createImageData(MASK_PX, MASK_PX);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    for (let j = 0, i = 0; j < a.length; j++, i += 4) {
      // 線の無い所は白（カードの地）、線は色。間は混ぜる
      const k = a[j] / 255;
      d.data[i] = 255 + (r - 255) * k;
      d.data[i + 1] = 255 + (g - 255) * k;
      d.data[i + 2] = 255 + (b - 255) * k;
      d.data[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
    if (!blob) throw new Error("画像を焼けなかった");
    return URL.createObjectURL(blob);
  });
  pngs.set(key, u);
  if (pngs.size > MASK_MAX) {
    const [old, url] = pngs.entries().next().value!;
    pngs.delete(old);
    url.then((x) => URL.revokeObjectURL(x)).catch(() => {});
  }
  return u;
}

function draw(): Person {
  const c = nextCombo();
  const g = characterSvg({ angles: STANDING, x: 0, groundY: 434, height: 434, facing: Math.random() < 0.5 ? "left" : "right", view: "front", role: c.role, headwear: c.headwear, outfit: c.outfit, hair: c.hair, face: randomFace() });
  // 塗りの色を書いていない部品（目など）は黒で塗られる。外側の g で黒を渡し、暗い所は黒・ほかは白にそろえてから焼く
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}"><g fill="#000">${recolor(g, "#000")}</g></svg>`;
  return { id: seq++, alpha: bake(svg) };
}

const win: Person[] = [];

function person(): Person {
  if (win.length < WINDOW) {
    win.push(draw());
    return win[win.length - 1];
  }
  const i = Math.floor(Math.random() * win.length);
  if (Math.random() < REFRESH) win[i] = draw();
  return win[i];
}

/** カードの片面: 窓の中の人を、渡した線の色（色の配り方は palette.ts）で焼いた PNG。焼き上がると URL になる */
export function sideIn(color: string): { face: Promise<string>; color: string } {
  return { face: colored(person(), color), color };
}
