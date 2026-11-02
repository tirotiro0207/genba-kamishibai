// 枠と指示（044a・工程 7）。監修者が絵の直したい部分を枠で囲み、「ここをこうしたい」を書くか話して送る。
// 枠はコマの見える範囲に対する割合（0〜1）。送った依頼は監査の記録 ④（人の直し）に残し、その 1 枚の作り直し（044b）が読む。

export const FIX_TEXT_MAX = 2000;
/** 小さすぎる枠（指が触れただけ）は送らない */
export const FIX_BOX_MIN = 0.03;

export interface FixBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FixRequest {
  /** 何コマ目か（0 から） */
  frame: number;
  box: FixBox;
  text: string;
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateFix(r: Partial<FixRequest> | null | undefined, frames: number): string[] {
  const errs: string[] = [];
  if (!r || typeof r !== "object") return ["依頼が無い"];
  if (!Number.isInteger(r.frame) || r.frame! < 0 || r.frame! >= frames) errs.push(`frame は 0〜${frames - 1}`);
  const b = r.box;
  if (!b || ![b.x, b.y, b.w, b.h].every(fin)) errs.push("枠の数が無い");
  else {
    if (b.x < 0 || b.y < 0 || b.x + b.w > 1.0001 || b.y + b.h > 1.0001) errs.push("枠が絵の外に出ている");
    if (b.w < FIX_BOX_MIN || b.h < FIX_BOX_MIN) errs.push("枠が小さすぎる");
  }
  const t = typeof r.text === "string" ? r.text.trim() : "";
  if (!t) errs.push("何をどう直したいかが空");
  if (t.length > FIX_TEXT_MAX) errs.push(`文は ${FIX_TEXT_MAX} 字まで`);
  return errs;
}

/** 2 点（押したところと離したところ）から枠を作る。絵の外に出た分は縁で止める */
export function boxFrom(a: [number, number], b: [number, number]): FixBox {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const [x0, x1] = [c(Math.min(a[0], b[0])), c(Math.max(a[0], b[0]))];
  const [y0, y1] = [c(Math.min(a[1], b[1])), c(Math.max(a[1], b[1]))];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
