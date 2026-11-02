// ③ 採点の画面。採点者ごとに開き、もう 1 人の判定は見えない。答えた人の ID も出さない
import { useCallback, useEffect, useState } from "react";
import { csvUrl, type Grade, type Grader, listGrades, listResponses, postGrade, type ResponseRow, type Verdict } from "./api";

const LABEL: Record<Verdict, string> = { correct: "正しい", wrong: "違う", danger: "危ない読み違い" };

function Row({ n, r, mine, onGrade }: { n: number; r: ResponseRow; mine?: Grade; onGrade: (v: Verdict, ja: string) => Promise<void> }) {
  const [ja, setJa] = useState(mine?.answer_ja ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mine?.answer_ja) setJa(mine.answer_ja);
  }, [mine?.answer_ja]);
  const go = async (v: Verdict) => {
    setBusy(true);
    try {
      await onGrade(v, ja);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="grade" data-testid={`grade-${r.seq}`}>
      <p className="who">答え {n}</p>
      <p className="said">{r.answer}</p>
      <label>
        日本語の訳
        <input value={ja} disabled={busy} onChange={(e) => setJa(e.target.value)} data-testid={`grade-${r.seq}-ja`} />
      </label>
      <div className="verdicts">
        {(Object.keys(LABEL) as Verdict[]).map((v) => (
          <button key={v} className={mine?.verdict === v ? `pick on ${v}` : `pick ${v}`} disabled={busy} onClick={() => go(v)} data-testid={`grade-${r.seq}-${v}`}>
            {LABEL[v]}
          </button>
        ))}
      </div>
    </li>
  );
}

export function GradeScreen({ tenant, id, grader }: { tenant: string; id: string; grader: Grader }) {
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [err, setErr] = useState("");
  const reload = useCallback(() => listGrades(tenant, id, grader).then(setGrades, (e: Error) => setErr(e.message)), [tenant, id, grader]);
  useEffect(() => {
    listResponses(tenant, id).then(setRows, (e: Error) => setErr(e.message));
    reload();
  }, [tenant, id, reload]);

  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p>読み込み中…</p>;
  const answers = rows.filter((r) => r.answer !== null);
  const mine = new Map<number, Grade>();
  for (const g of grades) mine.set(g.response_seq, g);
  const left = answers.filter((r) => !mine.has(r.seq)).length;

  return (
    <div className="grading">
      <p className="who">
        採点者 {grader === "g1" ? "1" : "2"} ・ のこり <span data-testid="grade-left">{left}</span> / {answers.length}
      </p>
      <ol className="grades">
        {answers.map((r, i) => (
          <Row
            key={r.seq}
            n={i + 1}
            r={r}
            mine={mine.get(r.seq)}
            onGrade={async (verdict, ja) => {
              await postGrade(tenant, id, { response_seq: r.seq, grader, verdict, answer_ja: ja || undefined }).catch((e: Error) => setErr(e.message));
              await reload();
            }}
          />
        ))}
      </ol>
      <a className="big" href={csvUrl(tenant, id)} download="answers.csv" data-testid="grade-csv">
        匿名の CSV を書き出す
      </a>
    </div>
  );
}
