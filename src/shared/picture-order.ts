// 絵だけで見せる順番（059）。回の種と参加者から乱数で決める。同じ種・同じ参加者なら同じ順番
import { rng } from "./assign";

export const PICTURES_MAX = 8;

/**
 * 絵の 8 枚のうち、やさしい日本語の文も一緒に見せるか（11/6 朝 作者「半分は言葉も付けて、半分は絵だけ」）。
 * 回に結んだ順（pos。0 から）の偶数番を、① の組 1 の人には文つき・組 2 の人には絵だけにし、奇数番はその逆。
 * どのカードも、文つきで見た人と絵だけで見た人が半分ずつになる。組の無い回（前からの回）はいつも絵だけ
 */
export function withWords(set: 1 | 2 | undefined, pos: number): boolean {
  if (set !== 1 && set !== 2) return false;
  return (pos % 2 === 0) === (set === 1);
}

export function pictureOrder<T>(seed: string, participant: string, cards: T[]): T[] {
  const r = rng(`${seed}:pictures:${participant}`);
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** カードごとに最後の予想を使う（記入は追記だけ） */
export function latestForecasts<T extends { card_id: string; seq: number }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of [...rows].sort((a, b) => a.seq - b.seq)) m.set(r.card_id, r);
  return m;
}
