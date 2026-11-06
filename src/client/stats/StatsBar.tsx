// いつも出しておく数字（048・仕様 §8）。作る側の画面の上に「危ない読み違い ○枚・1 枚 ○分・伝わる率 ○%」を常に出す。
// 新入社員の画面には出さない（App が作る側の画面にだけ置く）。カードの確かめ・状態が変わると読み直す。
import { useEffect, useState } from "react";
import type { Stats } from "../../shared/stats";
import { STATS_CHANGED } from "../events";
import { req } from "../make/MakeScreen";

// 知らせの名前と出し方は events.ts に置いた（req が保存・状態・署名のたびに出す）。前からの呼び出しのために、ここからも出す
export { STATS_CHANGED, statsChanged } from "../events";

export function StatsBar({ tenant }: { tenant: string }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => req<Stats>(tenant, "/cards/stats").then((x) => live && setS(x), () => live && setS(null));
    load();
    addEventListener(STATS_CHANGED, load);
    return () => {
      live = false;
      removeEventListener(STATS_CHANGED, load);
    };
  }, [tenant]);
  if (!s) return null;
  return (
    <p className="stats" data-testid="stats" data-dangerous={s.dangerous}>
      <span className={s.dangerous ? "stats-danger" : ""}>
        危ない読み違い <b data-testid="stats-dangerous">{s.dangerous}</b>枚
      </span>
      <span>
        1 枚 <b data-testid="stats-minutes">{s.minutes ?? "—"}</b>分
      </span>
      <span>
        伝わる率 <b data-testid="stats-rate">{s.rate ?? "—"}</b>%
      </span>
    </p>
  );
}
