// 見せるもの（カードか文）。① の交差の回（11/5 作者）では、カードの側はカードの絵とやさしい日本語、文の側は元のページの画像（日本語の原文のまま）。
// 中身が渡されないとき（前からの回）は枠だけ。src に先に読み込んだ画像を渡すと、ここでは読み込まない。
// onShown は絵か画像が画面に出た時（画像は decode のあと、次の描画の時）に 1 回呼ぶ。分かるまでの時間はここから数える
import { useEffect, useRef, useState } from "react";
import { Frames } from "../read/ReadScreen";
import { fileUrl, type MaterialItem, type Shown } from "./api";

const nextPaint = (f: () => void) => requestAnimationFrame(() => f());

export function Material({ shown, item, tenant, content, src: given, onShown }: { shown: Shown; item: "A" | "B"; tenant?: string; content?: MaterialItem; src?: string; onShown?: () => void }) {
  const [src, setSrc] = useState<string | null>(given ?? null);
  const [err, setErr] = useState("");
  const told = useRef(false);
  const tell = useRef(() => {});
  tell.current = () => {
    if (told.current || !onShown) return;
    told.current = true;
    onShown();
  };
  const page = content?.shown === "text" ? content.page : undefined;
  useEffect(() => {
    if (!page || !tenant || given) return;
    let url = "";
    fileUrl(tenant, page).then(
      (u) => setSrc((url = u)),
      (e: Error) => setErr(e.message),
    );
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [tenant, page, given]);
  const isCard = content?.shown === "card" && !!content.card;
  useEffect(() => {
    if (isCard) nextPaint(() => tell.current());
  }, [isCard]);

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
        {err ? (
          <p className="err">{err}</p>
        ) : src ? (
          <img
            className="material-page"
            src={src}
            alt={`元のページ（項目 ${item}）`}
            onLoad={(e) => {
              const done = () => nextPaint(() => tell.current());
              e.currentTarget.decode().then(done, done);
            }}
          />
        ) : (
          <p>読み込み中…</p>
        )}
      </div>
    );
  return (
    <div className={`material ${shown}`} data-testid="material" data-shown={shown}>
      {shown === "card" ? "カード" : "文"}（項目 {item}）
    </div>
  );
}
