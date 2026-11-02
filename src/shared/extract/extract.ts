// 取り出し（004 で中身を書く）
import type { CallDeps, Purpose } from "../claude";
import type { Claim } from "../eval/score";

/** 取り出しの中身ができたら true にする。false の間は、フックは流さずに通す */
export const EXTRACT_READY = false;

export async function extractClaims(_deps: CallDeps, _purpose: Purpose, _text: string): Promise<Claim[]> {
  throw new Error("取り出しはまだ無い（004）");
}
