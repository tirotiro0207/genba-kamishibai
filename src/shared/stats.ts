// いつも出しておく数字（048・仕様 §8）。「危ない読み違い ○枚・1 枚 ○分・伝わる率」を、画面の上に常に出す。
// 危ない読み違いは、今の版の確かめる AI の証拠で危ないと出た枚数（止めたカードは数えない）。
// 1 枚 ○分は、署名の記録 ⑤ の「開いてから署名までの分」の平均。伝わる率は、今の版に証拠のある枚の平均。
export interface Stats {
  dangerous: number;
  /** 1 枚あたりの分（署名の記録が無ければ null） */
  minutes: number | null;
  /** 伝わる率の平均（証拠のある枚が無ければ null） */
  rate: number | null;
  /** 伝わる率を出した枚数・署名の分を数えた枚数 */
  checked: number;
  signed: number;
}

export function summarize(evidence: { rate: number; dangerous: boolean }[], minutes: (number | null)[]): Stats {
  const mins = minutes.filter((m): m is number => typeof m === "number");
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return { dangerous: evidence.filter((e) => e.dangerous).length, minutes: avg(mins), rate: avg(evidence.map((e) => e.rate)), checked: evidence.length, signed: mins.length };
}
