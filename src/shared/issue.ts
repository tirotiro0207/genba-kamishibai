// 発行の管理（088）の決まり。週の数え方と、週の抜き取りでカードを選ぶ規則。
// 選ぶ規則は「種とカードの ID をつないだ文字の SHA-256 が小さい順に N 枚」。種を記録しておけば、あとで誰でも同じ 2 枚を選び直せる。
import { sha256Hex } from "./audit";

/** 1 週に抜き取る枚数 */
export const SAMPLE_SIZE = 2;
const JST_MS = 9 * 3600 * 1000;

/** 日本時間の ISO 週（例 2026-W45。月曜始まり、その週の木曜がある年で数える） */
export function isoWeek(now: Date): string {
  const d = new Date(now.getTime() + JST_MS);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** 種（乱数）を作る。16 バイトの 16 進 */
export const newSeed = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");

/** ids から種の順で n 枚選ぶ。同じ種と同じ ids なら、並びが違っても同じ n 枚（1 枚以下ならあるだけ） */
export async function pickSample(ids: string[], seed: string, n = SAMPLE_SIZE): Promise<string[]> {
  const ranked = await Promise.all([...new Set(ids)].map(async (id) => ({ id, key: await sha256Hex(`${seed}:${id}`) })));
  return ranked.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.id < b.id ? -1 : 1)).slice(0, n).map((x) => x.id);
}

/** 監修者の枠（今は 2 人。枠を足したら、ここに足す） */
export const SUPERVISORS = ["supervisor.1", "supervisor.2"] as const;

/**
 * 署名した監修者（supervisor.1 など）以外の監修者。見直しは署名した人とは別の人がする。
 * 監修者の一覧から、署名した人以外の最初の人を選ぶ。署名した人が監修者でない（署名は監修者だけの決まりの外）・ほかに監修者がいないときは null
 */
export function reviewerFor(signedBy: string, supervisors: readonly string[] = SUPERVISORS): string | null {
  if (!/^supervisor\.\d+$/.test(signedBy)) return null;
  return supervisors.find((s) => s !== signedBy) ?? null;
}
