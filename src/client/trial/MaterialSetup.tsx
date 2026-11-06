// ① で見せるものを回に結ぶ画面（11/5 作者）。項目ごとに、カードの ID と元のページの画像を 1 つずつ。
// 画像はこのテナントの置き場（pages/…）にだけ入れる。答えが始まった回は、サーバーが結び直しを断る
import { type FormEvent, useEffect, useState } from "react";
import { getMaterialConfig, putFile, putMaterial } from "./api";

type Slot = { card: string; page: string; file: File | null };
const empty: Slot = { card: "", page: "", file: null };

export function MaterialSetup({ tenant, id }: { tenant: string; id: string }) {
  const [s, setS] = useState<Record<"A" | "B", Slot>>({ A: empty, B: empty });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    getMaterialConfig(tenant, id).then(
      (m) => m && setS({ A: { ...empty, ...m.A }, B: { ...empty, ...m.B } }),
      // 読めなかったときは空の欄のまま黙らない（結び済みの回を作り直さないように）
      (e: Error) => setErr(`今の結び付けが読めない: ${e.message}`),
    );
  }, [tenant, id]);
  const set = (k: "A" | "B", v: Partial<Slot>) => setS((o) => ({ ...o, [k]: { ...o[k], ...v } }));
  const ready = (["A", "B"] as const).every((k) => s[k].card.trim() && (s[k].file || s[k].page));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const cfg = { A: { card: "", page: "" }, B: { card: "", page: "" } };
      for (const k of ["A", "B"] as const) {
        let page = s[k].page;
        const f = s[k].file;
        if (f) {
          const ext = (f.name.split(".").pop() || "png").toLowerCase();
          page = `pages/${id}-${k}.${ext}`;
          await putFile(tenant, page, f);
        }
        cfg[k] = { card: s[k].card.trim(), page };
      }
      await putMaterial(tenant, id, cfg);
      setS({ A: { ...cfg.A, file: null }, B: { ...cfg.B, file: null } });
      setMsg("結びました");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="answer" onSubmit={submit} data-testid="material-setup">
      {(["A", "B"] as const).map((k) => (
        <fieldset key={k}>
          <legend>項目 {k}</legend>
          <label>
            カードの ID
            <input value={s[k].card} disabled={busy} onChange={(e) => set(k, { card: e.target.value })} data-testid={`ms-card-${k}`} />
          </label>
          <label>
            元のページの画像{s[k].page && !s[k].file ? `（今: ${s[k].page}）` : ""}
            <input type="file" accept="image/*" disabled={busy} onChange={(e) => set(k, { file: e.target.files?.[0] ?? null })} data-testid={`ms-file-${k}`} />
          </label>
        </fieldset>
      ))}
      <button className="big" disabled={busy || !ready} data-testid="ms-submit">
        結ぶ
      </button>
      {msg && <p data-testid="ms-done">{msg}</p>}
      {err && <p className="err">{err}</p>}
    </form>
  );
}
