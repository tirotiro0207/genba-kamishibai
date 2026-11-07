// 会社の言葉の画面（11/7）。#/t/<テナント>/words。監修者だけが開く。
// AI が作る中で覚えた会社の言い方（呼び方・言い換え・使わない言い方）を一覧で見て、誤りを 1 行ずつ消す。
// 消すと次から手本に混ざらない（同じ直しがまた積まれれば、また出てくる）。新しい辞書ではなく、覚えた中身を確かめるための画面
import { useCallback, useEffect, useState } from "react";
import { req } from "../make/MakeScreen";

interface Word {
  kind: "call" | "rephrase" | "avoid";
  phrase: string;
  prefer: string;
  source: "glossary" | "edit";
  hits: number;
  last_card_id: string | null;
  updated_at: string;
}

const GROUPS: [Word["kind"], string, string][] = [
  ["call", "会社の呼び方", "用語表にある、日本語とベトナム語の組"],
  ["rephrase", "言い換え", "人が直したときの、前の言い方 → 後の言い方。2 回直されると、使わない言い方としても働く"],
  ["avoid", "使わない言い方", "直しで消された言い方"],
];

const key = (w: Pick<Word, "kind" | "phrase" | "prefer">) => `${w.kind}\u0000${w.phrase}\u0000${w.prefer}`;

export function WordsScreen({ tenant }: { tenant: string }) {
  const [words, setWords] = useState<Word[] | null>(null);
  const [err, setErr] = useState("");
  // 消す前に、もう一度押してもらう行
  const [ask, setAsk] = useState("");
  const load = useCallback(() => {
    req<{ words: Word[] }>(tenant, "/words").then(
      (r) => {
        setWords(r.words);
        setErr("");
      },
      (e: Error) => setErr(e.message),
    );
  }, [tenant]);
  useEffect(load, [load]);

  const remove = async (w: Word) => {
    try {
      await req(tenant, "/words", { method: "DELETE", body: JSON.stringify({ kind: w.kind, phrase: w.phrase, prefer: w.prefer }) });
      setAsk("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (err && !words) return <p className="err" data-testid="words-error">{err}</p>;
  if (!words) return <p>読み込み中…</p>;
  return (
    <section className="words" data-testid="words">
      <h1>会社の言葉</h1>
      <p className="home-meta">AI が作る中で覚えた、この会社の言い方です。まちがいがあれば消してください。</p>
      {err && <p className="err" data-testid="words-error">{err}</p>}
      {words.length === 0 && <p data-testid="words-empty">まだ覚えた言葉はありません</p>}
      {GROUPS.map(([kind, title, note]) => {
        const rows = words.filter((w) => w.kind === kind);
        if (!rows.length) return null;
        return (
          <div key={kind} data-testid={`words-${kind}`}>
            <h2>{title}（{rows.length}）</h2>
            <p className="home-meta">{note}</p>
            <ul>
              {rows.map((w) => (
                <li key={key(w)} data-testid="words-row">
                  <span>
                    {w.phrase}
                    {w.prefer ? ` → ${w.prefer}` : ""}
                  </span>{" "}
                  <small>
                    {w.source === "glossary" ? "用語表から" : "直しから"}・{w.hits} 回
                  </small>{" "}
                  {ask === key(w) ? (
                    <>
                      <button className="pick danger" onClick={() => remove(w)} data-testid="words-remove-yes">
                        本当に消す
                      </button>{" "}
                      <button className="pick" onClick={() => setAsk("")}>
                        やめる
                      </button>
                    </>
                  ) : (
                    <button className="pick" onClick={() => setAsk(key(w))} data-testid="words-remove">
                      消す
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
