// 時計 2 つ（095）の周ごとの塗り（11/5 作者）。1 周 = 60 秒。60 秒を超えたら周ごとに塗りを 1 段ずつ濃くし、何周したかを色で見せる。
// 塗りは透かさない（透かして重ねると色が混ざって濁る）。前の周は丸ごと 1 色、その上に今の周の扇。カードの側も文の側も同じ色の並び。
// 針と目盛りは、下の塗りに合わせて黒か白にし、コントラスト比 3:1 以上を保つ

/** 1 周の長さ */
export const LAP_MS = 60_000;

/** 文字盤の地の色（塗りの無いところ）。塗りとの見え方を保つため、画面の明るい・暗いの設定によらず決めた色にする */
export const FACE = "#ffffff";

/** 周ごとの塗りの色。1 周目から順に、同じ緑の系統で薄い → 濃い。これより先の周は最後の色のまま。差し替えるときはここだけ直す */
export const LAP_FILLS = ["#d4ecd9", "#8fcf9f", "#3f9a58", "#1d6b35", "#0c3f1d"] as const;

/** 針と目盛りに使う 2 つの色 */
export const INKS = ["#111111", "#ffffff"] as const;

/** 何周目か（1 から）。60 秒ちょうどは 1 周目の終わり */
export function lapOf(ms: number): number {
  return ms > 0 ? Math.ceil(ms / LAP_MS) : 1;
}

export interface DialPaint {
  /** 何周目か（1 から） */
  lap: number;
  /** 前の周を丸ごと塗る色。1 周目は文字盤の地 */
  under: string;
  /** 今の周の扇の色 */
  sweep: string;
  /** 今の周の扇の角度（0〜360） */
  deg: number;
  /** 針の色（扇と前の周の両方に対して見える色） */
  hand: string;
  /** 目盛りの色。扇の上と、扇の外（前の周か地）の上 */
  tickOn: string;
  tickOff: string;
}

/** 経った時間から、文字盤の塗りと針・目盛りの色を決める */
export function dialPaint(ms: number, fills: readonly string[] = LAP_FILLS): DialPaint {
  const lap = lapOf(ms);
  const at = (n: number) => fills[Math.min(n, fills.length) - 1];
  const under = lap === 1 ? FACE : at(lap - 1);
  const sweep = at(lap);
  const deg = ms > 0 ? ((ms - (lap - 1) * LAP_MS) / LAP_MS) * 360 : 0;
  return { lap, under, sweep, deg, hand: inkFor([under, sweep]), tickOn: inkFor([sweep]), tickOff: inkFor([under]) };
}

/** 並べた地の色のどれに対しても、いちばん見える（コントラスト比の小さい方が大きい）色 */
export function inkFor(bgs: string[]): string {
  const worst = (ink: string) => Math.min(...bgs.map((b) => contrast(ink, b)));
  return INKS.reduce((a, b) => (worst(b) > worst(a) ? b : a));
}

/** 2 色のコントラスト比（WCAG の相対輝度で） */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** 秒の出し方。60 秒までは「23.4 秒」、超えたら「1 分 23.4 秒」 */
export function formatSec(ms: number): string {
  const tenths = Math.round(ms / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} 秒`;
  return `${Math.floor(tenths / 600)} 分 ${((tenths % 600) / 10).toFixed(1)} 秒`;
}
