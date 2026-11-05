// 入口の背景のカードに描く顔（11/5 作者）。人形の部品（髪・かぶり物・目・まつ毛・口など）を乱数で組み、胸から上を正方形に切り抜く。
// 色は 11/5 の作者の直し: 黒い線と黒い塗りだけにカードの色を付け、ほかは全部白で抜く（カードの地も白）。
// 1 枚ごとに SVG を描くと流れる行が重くなるので、data: の画像にして同じ絵を使い回す（POOL 人を先に描き、色ごとに覚えておく）
import { avatarParts } from "./avatar-pick";
import { characterSvg } from "../../shared/picto/character";
import { STANDING } from "../../shared/picto/skeleton";

/** 線の色（11/5 作者「それぞれ色があって、ランダムに」）。白い地の上で線が読める濃さの色だけ */
export const LINE_COLORS = ["#d64545", "#e07b00", "#c99700", "#3f9142", "#0f8a7e", "#1f78c8", "#4b55c4", "#8a4fc8", "#c23d8a", "#6b6b6b", "#a0522d", "#2a2a2a"];

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

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

const POOL = 72;
const people: string[] = [];
const urls = new Map<string, string>();

function person(): string {
  if (people.length < POOL) {
    const g = characterSvg({ angles: STANDING, x: 0, groundY: 434, height: 434, facing: Math.random() < 0.5 ? "left" : "right", view: "front", ...avatarParts() });
    people.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}">${g}</svg>`);
    return people[people.length - 1];
  }
  return pick(people);
}

/** カードの片面: 乱数で選んだ人を、乱数で選んだ線の色で描いた画像（data: の URL） */
export function randomSide(): { face: string; color: string } {
  const svg = person();
  const color = pick(LINE_COLORS);
  const key = `${people.indexOf(svg)}:${color}`;
  let u = urls.get(key);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolor(svg, color))}`;
    urls.set(key, u);
  }
  return { face: u, color };
}
