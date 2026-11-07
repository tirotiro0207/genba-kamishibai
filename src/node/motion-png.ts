// キーフレームの JSON から、印の付いた時刻のコマを PNG に切り出す（079a）
import { type CardShape, isPrinciple } from "../shared/card";
import { cutFrames, type MotionJson, validateMotion } from "../shared/picto/motion";
import { renderFrame } from "../shared/picto/scene";
import { svgToPng } from "./png";

/** 原則の 1 コマのカード（shape: principle）は、キーフレームが 1 つでよい（カードの検査と同じ） */
export function cutPngs(m: MotionJson, opts: { shape?: CardShape } = {}): { t: number; png: Uint8Array }[] {
  const errs = validateMotion(m, { single: isPrinciple(opts) });
  if (errs.length) throw new Error(`動きの JSON が範囲の外: ${errs.join(" / ")}`);
  return cutFrames(m).map(({ t, frame }) => ({ t, png: svgToPng(renderFrame(frame).svg) }));
}
