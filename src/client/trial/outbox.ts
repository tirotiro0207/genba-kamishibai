// 送れていない答えの置き場（11/5 作者）。会場の回線が遅くても切れても、答えと時間を消さない。
// 送る前に端末の中（localStorage）に置き、届くか 409（もう届いている）が返るまで自動で送り直す。ページを読み直しても戻る。
// 4xx（409 を除く）は送り直しても直らないので止めて、理由を画面に出す。5xx と通信切れだけ、間隔を伸ばしながら送り直す
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
const RETRY_MAX_MS = 60000;

/** 失敗が続いた回数から、次に送り直すまでの間隔（4 秒から倍々で、1 分まで） */
export function retryDelay(fails: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** Math.max(0, fails));
}

/** 送り直しても直らない失敗か。409 は届いている扱いなのでここには来ない。408・429 は待てば通ることがあるので送り直す */
export function isFinalError(err: unknown): boolean {
  const st = (err as { status?: number } | null)?.status;
  return typeof st === "number" && st >= 400 && st < 500 && st !== 408 && st !== 429;
}

/**
 * 置いてある答えを順に送る。届いた（409 を含む）ものは delivered、直らない失敗は blocked（理由つき）、
 * 通信切れ・5xx は retry を立てて残す。skip にあるものは送らない
 */
export async function drainOutbox<E>(items: E[], send: (e: E) => Promise<unknown>, skip: Map<E, string> = new Map()) {
  const delivered: E[] = [];
  const blocked = new Map<E, string>();
  let retry = false;
  for (const e of items) {
    if (skip.has(e)) {
      blocked.set(e, skip.get(e) ?? "");
      continue;
    }
    try {
      await send(e);
      delivered.push(e);
    } catch (err) {
      const st = (err as { status?: number } | null)?.status;
      if (st === 409) delivered.push(e);
      else if (isFinalError(err)) blocked.set(e, (err as Error)?.message || `HTTP ${st}`);
      else retry = true;
    }
  }
  return { delivered, blocked, retry };
}

/** same: 同じ答えかを見る（同じ項目・同じカード）。send は届いたら解決し、失敗したら投げる（status をつけた Error） */
export function useOutbox<E>(key: string, send: (e: E) => Promise<unknown>, same: (a: E, b: E) => boolean) {
  const [pending, setPending] = useState<E[]>(() => load<E>(key));
  const [blockedMsg, setBlockedMsg] = useState("");
  const [fails, setFails] = useState(0);
  const busy = useRef(false);
  const ref = useRef(pending);
  const stuck = useRef(new Map<E, string>());
  ref.current = pending;
  const put = useCallback(
    (es: E[]) => {
      ref.current = es;
      save(key, es);
      setPending(es);
    },
    [key],
  );
  /** manual: 画面のボタンから。止めていたものも、もう一度送る */
  const run = useCallback(
    async (manual: boolean) => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (manual) stuck.current = new Map();
        const items = [...ref.current];
        const r = await drainOutbox(items, send, stuck.current);
        stuck.current = r.blocked;
        setBlockedMsg([...r.blocked.values()][0] ?? "");
        // 送っている間に足された答えを落とさないよう、今の置き場から届いた分だけ外す
        if (r.delivered.length) put(ref.current.filter((x) => !r.delivered.some((d) => same(d, x))));
        setFails(r.retry ? (f) => f + 1 : 0);
      } finally {
        busy.current = false;
      }
    },
    [send, same, put],
  );
  const flush = useCallback(() => run(true), [run]);
  const add = useCallback(
    (e: E) => {
      put([...ref.current.filter((x) => !same(x, e)), e]);
      void run(false);
    },
    [put, same, run],
  );
  // 送り直すのは通信切れ・5xx のときだけ（止めたものは run が飛ばす）。間隔は失敗のたびに伸ばす
  useEffect(() => {
    if (!pending.length) return;
    const t = setTimeout(() => void run(false), retryDelay(fails));
    const on = () => void run(false);
    addEventListener("online", on);
    return () => {
      clearTimeout(t);
      removeEventListener("online", on);
    };
  }, [pending.length, fails, run]);
  useEffect(() => {
    void run(false);
  }, [run]);
  return { pending, add, flush, blocked: blockedMsg };
}
