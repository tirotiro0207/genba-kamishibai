// 見せるもの（カードか文）。① の交差の回（11/5 作者）では、カードの側はカードの絵とやさしい日本語、文の側は元のページの画像（日本語の原文のまま）。
// 中身が渡されないとき（前からの回）は枠だけ
import { useEffect, useState } from "react";
import { Frames } from "../read/ReadScreen";
import { fileUrl, type MaterialItem, type Shown } from "./api";

export function Material({ shown, item, tenant, content }: { shown: Shown; item: "A" | "B"; tenant?: string; content?: MaterialItem }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const page = content?.shown === "text" ? content.page : undefined;
  useEffect(() => {
    if (!page || !tenant) return;
    let url = "";
    fileUrl(tenant, page).then(
      (u) => setSrc((url = u)),
      (e: Error) => setErr(e.message),
    );
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [tenant, page]);

  if (content?.shown === "card" && content.card)
    return (
      <div className="material card filled" data-testid="material" data-shown="card">
        <Frames motion={content.card.motion} />
        {content.card.words && <p className="read-words">{content.card.words.ja}</p>}
      </div>
    );
  if (page)
    return (
      <div className="material text filled" data-testid="material" data-shown="text">
        {err ? <p className="err">{err}</p> : src ? <img className="material-page" src={src} alt={`元のページ（項目 ${item}）`} /> : <p>読み込み中…</p>}
      </div>
    );
  return (
    <div className={`material ${shown}`} data-testid="material" data-shown={shown}>
      {shown === "card" ? "カード" : "文"}（項目 {item}）
    </div>
  );
}
