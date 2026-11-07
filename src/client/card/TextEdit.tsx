// 絵のカードの上に出す文（11/6 作者「やさしい日本語・決まり・なぜを絵の上に出して、文言も直せるように」）。
// 「文を直す」で 3 つの欄が書ける欄になり、「保存」で PUT /cards/:id に送る。直すと版が 1 つ上がり、下書きに戻る（ほかの直しと同じ）。
// 決まりとなぜは、カードの文（statements）にも同じ文を入れる。1 つの欄が 2 文以上に分かれていたら、最初の文に新しい文と元の位置を全部まとめ、
// ほかの文を指していた部品はその文を指すように付け替える（経路は切らない）。言葉の訳（vi）は変えずに残す
import { useState } from "react";
import { type CardBody, type Statement, wordsRubyErrors } from "../../shared/card";
import { req } from "../make/MakeScreen";
import type { CheckedCard } from "./Check";
import { Ruby } from "../Ruby";

/** 決まりかなぜの文を差し替えた中身。変わっていなければ同じ中身を返す */
export function withText(body: CardBody, field: "rule" | "why", text: string): CardBody {
  if (body[field] === text) return body;
  const mine = body.statements.filter((s) => s.field === field);
  if (!mine.length) return { ...body, [field]: text };
  const head = mine[0];
  const gone = new Set(mine.slice(1).map((s) => s.id));
  const sources = [...new Map(mine.flatMap((s) => s.sources).map((r) => [JSON.stringify(r), r])).values()];
  const merged: Statement = { ...head, text, sources, ...(mine.some((s) => s.ai) ? { ai: true } : {}) };
  return {
    ...body,
    [field]: text,
    statements: body.statements.filter((s) => !gone.has(s.id)).map((s) => (s.id === head.id ? merged : s)),
    parts: body.parts.map((p) => (gone.has(p.statement) ? { ...p, statement: head.id } : p)),
  };
}

const LABEL = { words: "やさしい日本語", rule: "決まり（やること・やらないこと）", why: "なぜ" } as const;

export function TextEdit({ tenant, card, onSaved }: { tenant: string; card: CheckedCard; onSaved: (c: CheckedCard) => void }) {
  const b = card.body;
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({ words: b.words?.ja ?? "", rule: b.rule, why: b.why });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const open = () => {
    setDraft({ words: b.words?.ja ?? "", rule: b.rule, why: b.why });
    setErr("");
    setEdit(true);
  };

  async function save() {
    const rule = draft.rule.trim();
    const why = draft.why.trim();
    const words = draft.words.trim();
    if (!rule || !why || (b.words && !words)) return setErr("空の欄があります");
    let next = withText(withText(b, "rule", rule), "why", why);
    if (b.words && words !== b.words.ja) next = { ...next, words: { ...b.words, ja: words } };
    // 言葉の欄のふりがなは、送る前に同じ決まり（wordsRubyErrors）で確かめる。どの漢字に足りないかをその場で出す（11/7）
    const ruby = wordsRubyErrors(next, b);
    if (ruby.length) return setErr(ruby.join(" / "));
    const fields = [b.words && words !== b.words.ja ? LABEL.words : "", rule !== b.rule ? "決まり" : "", why !== b.why ? LABEL.why : ""].filter(Boolean);
    if (!fields.length) return setEdit(false);
    setBusy(true);
    setErr("");
    try {
      await req(tenant, `/cards/${encodeURIComponent(card.id)}`, { method: "PUT", body: JSON.stringify({ card: next, reason: `文を直した（${fields.join("・")}）` }) });
      const fresh = await req<CheckedCard>(tenant, `/cards/${encodeURIComponent(card.id)}`);
      setEdit(false);
      onSaved(fresh);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows: { key: keyof typeof draft; text: string | undefined }[] = [
    { key: "words", text: b.words?.ja },
    { key: "rule", text: b.rule },
    { key: "why", text: b.why },
  ];
  return (
    <section className="card-lead" data-testid="card-lead">
      <dl>
        {rows.map(({ key, text }) =>
          key === "words" && !b.words ? null : (
            <div key={key} className={`card-lead-row lead-${key}`}>
              <dt>{LABEL[key]}</dt>
              <dd>
                {edit ? (
                  <textarea value={draft[key]} rows={key === "words" ? 3 : 2} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} data-testid={`card-lead-input-${key}`} />
                ) : (
                  <span data-testid={`card-lead-${key}`}>{key === "words" && text ? <Ruby text={text} /> : text}</span>
                )}
              </dd>
            </div>
          ),
        )}
      </dl>
      <div className="card-lead-actions">
        {edit ? (
          <>
            <button className="pick go-pick" disabled={busy} onClick={() => void save()} data-testid="card-lead-save">
              保存する
            </button>
            <button className="pick" disabled={busy} onClick={() => setEdit(false)} data-testid="card-lead-cancel">
              やめる
            </button>
            <small>保存すると版が 1 つ上がり、下書きに戻ります（確認待ち・署名済みのカードも）。ふりがなは「｜漢字《よみ》」と書きます。</small>
          </>
        ) : (
          <button className="pick" onClick={open} data-testid="card-lead-edit">
            文を直す
          </button>
        )}
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}
