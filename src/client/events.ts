// 画面どうしで知らせ合う小さな出来事。どの画面からも呼べるように、ほかの部品を読まない小さなファイルに置く。

/** カードが変わった（保存・直し・戻す・状態・署名）。上の数字の帯（StatsBar）が読み直す */
export const STATS_CHANGED = "kamishibai:stats";
export const statsChanged = () => dispatchEvent(new Event(STATS_CHANGED));

/** API が「PIN で入ってください」「役割で入ってください」を返した。App が PIN の画面に戻す（入り直したら、今の画面を読み直す） */
export const PIN_LOST = "kamishibai:pin-lost";
export const pinLost = (tenant: string) => dispatchEvent(new CustomEvent<string>(PIN_LOST, { detail: tenant }));
