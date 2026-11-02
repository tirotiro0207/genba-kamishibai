// 1 コマの絵（015〜）。白い背景・地面の線・人形を重ねる。小物と吹き出しは 017・018 で足す。
import { type FigureSpec, figureSvg, type Posed, posePoints } from "./skeleton";

export const SIZE = 768;
export const GROUND = 0.86;

export interface Frame {
  figures: FigureSpec[];
}

export interface Rendered {
  svg: string;
  posed: Posed[];
}

export function renderFrame(frame: Frame, size = SIZE): Rendered {
  const g = GROUND * size;
  const posed = frame.figures.map((f) => posePoints(f, size, g));
  const body = [
    `<g data-part="bg"><rect width="${size}" height="${size}" fill="#fff"/></g>`,
    `<g data-part="ground"><line x1="0" y1="${g}" x2="${size}" y2="${g}" stroke="#000" stroke-width="${Math.round(size * 0.008)}"/></g>`,
    ...posed.map((p) => figureSvg(p)),
  ];
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body.join("")}</svg>`, posed };
}
