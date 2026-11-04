// 送れていない答えの置き場（11/5 作者）。会場の回線が遅くても切れても、答えと時間を消さない。
// 送る前に端末の中（localStorage）に置き、届くか 409（もう届いている）が返るまで自動で送り直す。ページを読み直しても戻る
import { useCallback, useEffect, useRef, useState } from "react";

function load<E>(key: string): E[] {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as E[]) : [];
  } catch {
    return [];
  }
}
function save<E>(key: string, es: E[]) {
  try {
    if (es.length) localStorage.setItem(key, JSON.stringify(es));
    else localStorage.removeItem(key);
  } catch {
    // 置けないときも画面の中には残る
  }
}

const RETRY_MS = 4000;

/** same: 同じ答えかを見る（同じ項目・同じカード）。send は届いたら解決し、失敗したら投げる */
export function useOutbox<E>(key: string, send: (e: E) => Promise<unknown>, same: (a: E, b: E) => boolean) {
  const [pending, setPending] = useState<E[]>(() => load<E>(key));
  const busy = useRef(false);
  const ref = useRef(pending);
  ref.current = pending;
  const put = useCallback(
    (es: E[]) => {
      ref.current = es;
      save(key, es);
      setPending(es);
    },
    [key],
  );
  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (const e of [...ref.current]) {
        try {
          await send(e);
        } catch (err) {
          // 409 はもう届いている（前の送信の返事だけが落ちた）。それ以外は置いたまま、次に送り直す
          if ((err as { status?: number }).status !== 409) break;
        }
        put(ref.current.filter((x) => !same(x, e)));
      }
    } finally {
      busy.current = false;
    }
  }, [send, same, put]);
  const add = useCallback(
    (e: E) => {
      put([...ref.current.filter((x) => !same(x, e)), e]);
      void flush();
    },
    [put, same, flush],
  );
  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(() => void flush(), RETRY_MS);
    const on = () => void flush();
    addEventListener("online", on);
    return () => {
      clearInterval(t);
      removeEventListener("online", on);
    };
  }, [pending.length, flush]);
  useEffect(() => {
    void flush();
  }, [flush]);
  return { pending, add, flush };
}
