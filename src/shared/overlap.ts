// 080・102: ある文に、別の文の一続きの n 文字がそのまま入っていないかを見る（写しの検出）。
// 空白・句読点・記号を落としてから比べるので、改行や読点の位置が違っても見つかる。

/** 比べる前に落とす: 空白・句読点・括弧・記号 */
export const normalize = (s: string) => s.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");

/** source の中の n 文字の切れ端を全部集める */
export function shingles(source: string, n: number): Set<string> {
  const t = normalize(source);
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
  return out;
}

/** text に、sources のどれかの n 文字がそのまま入っていれば、その切れ端を返す（無ければ空） */
export function copiedRuns(text: string, sources: string[], n = 15): string[] {
  const bag = new Set<string>();
  for (const s of sources) for (const g of shingles(s, n)) bag.add(g);
  const t = normalize(text);
  const hits: string[] = [];
  for (let i = 0; i + n <= t.length; i++) {
    const g = t.slice(i, i + n);
    if (bag.has(g) && !hits.some((h) => h.includes(g.slice(0, n - 1)))) hits.push(g);
  }
  return hits;
}
