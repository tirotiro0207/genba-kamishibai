// 新入社員の匿名の結果（094 の公開デモで、見る人の答えと並べる）。現場の確認の日の結果（072 の集計）が入るまでは作りものの数。
// 名前・声・顔は入れない。人数と中央値と正答率だけ

export interface NewhireResults {
  /** 作りものの数なら true（画面にそう出す） */
  fake: boolean;
  /** ① 分かるまでの時間の中央値（ミリ秒）と人数 */
  time: { card_ms: number; text_ms: number; n: number };
  /** ② 絵だけで答えて合っていた人の数と人数 */
  picture: { correct: number; n: number };
}

export const FAKE_NEWHIRE: NewhireResults = { fake: true, time: { card_ms: 4200, text_ms: 13800, n: 10 }, picture: { correct: 8, n: 10 } };

/** 見る人の秒を、新入社員のカードと文の中央値と並べる。速い順の何番目か（1 から）も返す */
export function placeTime(youMs: number, r: NewhireResults) {
  const rows = [
    { who: "you" as const, ms: youMs },
    { who: "card" as const, ms: r.time.card_ms },
    { who: "text" as const, ms: r.time.text_ms },
  ].sort((a, b) => a.ms - b.ms);
  return { rows, rank: rows.findIndex((x) => x.who === "you") + 1 };
}

/** 新入社員の正答率（%・小数 0 桁） */
export const pictureRate = (r: NewhireResults) => (r.picture.n ? Math.round((r.picture.correct / r.picture.n) * 100) : null);
