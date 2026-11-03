// 仕分けの結果と、会期前に作った見込みの一覧の照合（024）。見込みの一覧はリポジトリの外に置き、仕分けが済んでからここで初めて読む。
// 見込みの一覧は「カードにする」と見込んだページの番号だけを持つ。一覧に無いページは「しない」と見込んだものとして数える。

export interface SortedPage {
  page: number;
  card: boolean | null;
  reason: string | null;
}

export interface CheckRow {
  page: number;
  got: boolean;
  want: boolean;
  reason: string;
}

export interface CheckSummary {
  /** 照合できたページ（仕分けが済んだもの） */
  pages: number;
  agree: number;
  /** 見込みは「する」、仕分けは「しない」 */
  missed: CheckRow[];
  /** 見込みは「しない」、仕分けは「する」 */
  extra: CheckRow[];
  /** 仕分けが済んでいないページ */
  pending: number[];
}

/** 見込みの一覧の文からページの番号を読む。JSON の数の配列（{page} の配列も可）か、1 行に 1 つの番号か範囲（3 / 5-7）の文 */
export function parseExpected(text: string): Set<number> {
  const out = new Set<number>();
  const t = text.trim();
  if (t.startsWith("[") || t.startsWith("{")) {
    const j = JSON.parse(t) as unknown;
    const arr = Array.isArray(j) ? j : ((j as { pages?: unknown }).pages as unknown[]);
    if (!Array.isArray(arr)) throw new Error("見込みの一覧の JSON は、ページの番号の配列か {pages: [...]}");
    for (const x of arr) {
      const n = typeof x === "number" ? x : Number((x as { page?: unknown }).page);
      if (!Number.isInteger(n)) throw new Error(`見込みの一覧にページの番号でないものがある: ${JSON.stringify(x)}`);
      out.add(n);
    }
    return out;
  }
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/(\d+)\s*(?:[-~〜–]\s*(\d+))?/);
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    for (let p = from; p <= to; p++) out.add(p);
  }
  return out;
}

export function checkSort(sorted: SortedPage[], expected: Set<number>): CheckSummary {
  const s: CheckSummary = { pages: 0, agree: 0, missed: [], extra: [], pending: [] };
  for (const p of [...sorted].sort((a, b) => a.page - b.page)) {
    if (p.card === null) {
      s.pending.push(p.page);
      continue;
    }
    s.pages++;
    const want = expected.has(p.page);
    const row = { page: p.page, got: p.card, want, reason: p.reason ?? "" };
    if (p.card === want) s.agree++;
    else (want ? s.missed : s.extra).push(row);
  }
  return s;
}
