// 回答の記録の順番の乱数（011）。同じ種なら同じ割り当て。参加者ごとに項目 A の見せる順番を決め、項目 B はその逆にする。
export type Shown = "card" | "text";
export interface Assignment {
  participant: string;
  /** 項目 A で見せる順番 */
  A: [Shown, Shown];
  /** 項目 B で見せる順番（A の逆） */
  B: [Shown, Shown];
}

/** 文字列の種から 32 bit の数（FNV-1a） */
function seedHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** 種から決まる乱数の列（mulberry32） */
export function rng(seed: string): () => number {
  let a = seedHash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 参加者の半分ずつが「カードが先」「文が先」になるよう、並べた半分ずつを乱数で入れ替える */
export function assign(seed: string, participants: string[]): Assignment[] {
  const r = rng(seed);
  const firsts: Shown[] = participants.map((_, i) => (i % 2 === 0 ? "card" : "text"));
  for (let i = firsts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [firsts[i], firsts[j]] = [firsts[j], firsts[i]];
  }
  return participants.map((participant, i) => {
    const A: [Shown, Shown] = firsts[i] === "card" ? ["card", "text"] : ["text", "card"];
    return { participant, A, B: [A[1], A[0]] };
  });
}

/** 新しい種（記録に残す） */
export function newSeed(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
