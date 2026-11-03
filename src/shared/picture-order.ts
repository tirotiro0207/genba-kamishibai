// 絵だけで見せる順番（059）。回の種と参加者から乱数で決める。同じ種・同じ参加者なら同じ順番
import { rng } from "./assign";

export const PICTURES_MAX = 8;

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
