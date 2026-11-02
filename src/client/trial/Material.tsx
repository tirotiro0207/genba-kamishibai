// 見せるもの（カードか文）。中身は 019 以降で本物のカードと文に差し替える。いまは枠だけ
import type { Shown } from "./api";

export function Material({ shown, item }: { shown: Shown; item: "A" | "B" }) {
  return (
    <div className={`material ${shown}`} data-testid="material" data-shown={shown}>
      {shown === "card" ? "カード" : "文"}（項目 {item}）
    </div>
  );
}
