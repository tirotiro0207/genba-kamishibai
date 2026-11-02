// キーフレームの JSON から、印の付いた時刻のコマを PNG に切り出す（079a）
import { cutFrames, type MotionJson, validateMotion } from "../shared/picto/motion";
import { renderFrame } from "../shared/picto/scene";
import { svgToPng } from "./png";

export function cutPngs(m: MotionJson): { t: number; png: Uint8Array }[] {
  const errs = validateMotion(m);
  if (errs.length) throw new Error(`動きの JSON が範囲の外: ${errs.join(" / ")}`);
  return cutFrames(m).map(({ t, frame }) => ({ t, png: svgToPng(renderFrame(frame).svg) }));
}
