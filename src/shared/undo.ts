// 元に戻す（11/6）。1 つ前の版の中身を、監査の記録 ④ の直しの行（前と後）から組み立て直す。
// 戻すのも直しの 1 つとして版を 1 つ上げ、理由・直した人・日時を記録に足す（記録は消さない・書き換えない）。
// 続けて押すと、さらに 1 つ前へ戻る（戻した行には、どの版の中身に戻したかを restored に残す）。
import type { CardBody } from "./card";
import type { MotionJson } from "./picto/motion";

/** 版を上げた直しの行の payload（PUT の直し・戻す・枠からの作り直し） */
export interface EditRow {
  to_version?: number;
  request?: string;
  /** PUT の直しと戻す: 変えた欄の前の値（無かった欄は null） */
  fields?: string[];
  before?: unknown;
  /** 戻す: どの版の中身に戻したか */
  restored?: number;
}

export class UndoError extends Error {}

/** 1 つ前の版の番号。今の版が「戻す」で作られたなら、戻した先のさらに 1 つ前 */
export function undoTarget(version: number, rows: EditRow[]): number {
  const last = rows.find((r) => r.to_version === version);
  const target = last?.request === "undo" && typeof last.restored === "number" ? last.restored - 1 : version - 1;
  if (target < 1) throw new UndoError("これより前の版は無い");
  return target;
}

/** 今の中身から、記録の行を新しい順にさかのぼって、target の版の中身を作る */
export function bodyAt(current: CardBody, version: number, rows: EditRow[], target: number): CardBody {
  let body = structuredClone(current);
  for (let v = version; v > target; v--) {
    const row = rows.find((r) => r.to_version === v);
    if (!row) throw new UndoError(`版 ${v} の直しの記録が無いので、戻せない`);
    if (row.request === "redone") {
      const key = row.before as MotionJson["keyframes"][number] | null;
      if (body.motion.kind !== "keyframes" || !key) throw new UndoError(`版 ${v} の作り直しの前の絵が記録に無い`);
      const i = body.motion.json.keyframes.findIndex((k) => k.mark && Math.abs(k.t - key.t) < 1e-6);
      if (i < 0) throw new UndoError(`版 ${v} の作り直しのコマが見つからない`);
      const keyframes = body.motion.json.keyframes.map((k, j) => (j === i ? key : k));
      body = { ...body, motion: { kind: "keyframes", json: { keyframes } } };
    } else {
      const before = (row.before ?? {}) as Record<string, unknown>;
      if (!row.fields?.length) throw new UndoError(`版 ${v} の直しの記録に、変えた欄が無い`);
      const next = { ...body } as Record<string, unknown>;
      for (const f of row.fields) {
        if (before[f] === null || before[f] === undefined) delete next[f];
        else next[f] = structuredClone(before[f]);
      }
      body = next as unknown as CardBody;
    }
  }
  return body;
}
