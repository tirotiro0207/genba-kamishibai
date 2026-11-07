// 入口の背景のカードに描く顔（11/5 作者）。人形の部品（髪・かぶり物・目・まつ毛・口など）を乱数で組み、胸から上を正方形に切り抜く。
// 色は 11/5 の作者の直し: 黒い線と黒い塗りだけにカードの色を付け、ほかは全部白で抜く（カードの地も白）。
// 1 人ごとに線だけのマスクの PNG に焼き、カードの側で色を付ける（下の「速さの直し」）
import { type Combo, nextCombo, randomFace } from "./avatar-pick";
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
const MASK_MAX = 1200;

interface Person {
  id: number;
  /** 職業（業種と役の名前）。隣に同じ職業を並べないために使う */
  job: string;
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
/**
 * 線の濃さに色を付けた PNG（data URL）。人と色の組ごとに MASK_MAX 枚まで覚え、古いものから捨てる。
 * 11/7: 線にぼかしの光を敷く形も試したが、細かい線が見えなくなり画質が落ちて見えた（作者）。線はくっきりのままにし、光らせるのはカードの縁だけ（login.css）。
 * 前は object URL にしていて、覚えから捨てるときに URL を無効にしていた。画面には裏表で 400 枚より多くの絵が並ぶので、
 * まだ映っている絵の URL まで無効になり、読み込めない絵の印が出ていた（11/7 作者の画面）。data URL は文字なので無効にならない
 */
function colored(p: Person, color: string): Promise<string> {
  const key = `${p.id}:${color}`;
  let u = pngs.get(key);
  if (u) return u;
  u = p.alpha.then(async (a) => {
    // 線だけの絵（線の無い所は透明）
    const line = document.createElement("canvas");
    line.width = line.height = MASK_PX;
    const lctx = line.getContext("2d")!;
    const d = lctx.createImageData(MASK_PX, MASK_PX);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    for (let j = 0, i = 0; j < a.length; j++, i += 4) {
      d.data[i] = r;
      d.data[i + 1] = g;
      d.data[i + 2] = b;
      d.data[i + 3] = a[j];
    }
    lctx.putImageData(d, 0, 0);
    // 白い地に、くっきりした線
    const cv = document.createElement("canvas");
    cv.width = cv.height = MASK_PX;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, MASK_PX, MASK_PX);
    ctx.drawImage(line, 0, 0);
    return cv.toDataURL("image/png");
  });
  pngs.set(key, u);
  if (pngs.size > MASK_MAX) {
    const old = pngs.keys().next().value!;
    pngs.delete(old);
  }
  return u;
}

const jobOf = (c: Combo) => `${c.industry}/${c.name}`;

/** 避けたい職業でない次の掛け合わせ（20 回引いても無ければ、最後に引いたもの） */
function comboAvoiding(avoid: Set<string>): Combo {
  let c = nextCombo();
  for (let k = 0; k < 20 && avoid.has(jobOf(c)); k++) c = nextCombo();
  return c;
}

function draw(c: Combo): Person {
  const g = characterSvg({ angles: STANDING, x: 0, groundY: 434, height: 434, facing: Math.random() < 0.5 ? "left" : "right", view: "front", role: c.role, headwear: c.headwear, outfit: c.outfit, hair: c.hair, face: randomFace() });
  // 塗りの色を書いていない部品（目など）は黒で塗られる。外側の g で黒を渡し、暗い所は黒・ほかは白にそろえてから焼く
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}"><g fill="#000">${recolor(g, "#000")}</g></svg>`;
  return { id: seq++, job: jobOf(c), alpha: bake(svg) };
}

const win: Person[] = [];

/** 窓の中から 1 人。avoid の職業の人は選ばない（窓の中に居なければ、新しく描く） */
function person(avoid: Set<string>): Person {
  if (win.length < WINDOW) {
    win.push(draw(comboAvoiding(avoid)));
    return win[win.length - 1];
  }
  const ok = win.map((_, i) => i).filter((i) => !avoid.has(win[i].job));
  const i = ok.length ? ok[Math.floor(Math.random() * ok.length)] : Math.floor(Math.random() * win.length);
  if (!ok.length || Math.random() < REFRESH) win[i] = draw(comboAvoiding(avoid));
  return win[i];
}

/** カードの片面: 窓の中の人を、渡した線の色（色の配り方は palette.ts）で焼いた PNG。焼き上がると URL になる。avoid は隣に見えている職業 */
export function sideIn(color: string, avoid: string[] = []): { face: Promise<string>; color: string; job: string } {
  const p = person(new Set(avoid));
  return { face: colored(p, color), color, job: p.job };
}
