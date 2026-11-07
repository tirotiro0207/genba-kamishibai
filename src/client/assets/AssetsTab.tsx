// アセットのタブ（11/7 作者「アセットが見れるところ。プロンプトで編集・画像を添付して直せる」）。作る側のホームに置く。
// カードの絵に使う小物・服・表情を、3 つの見出しに分けて一覧で描き、1 つ選ぶと: 今の絵・直したいことの欄・画像の添付（現場の写真・手描き）・「直す」。
// 服と表情は 3 つの向き（正面・斜め・真横）の前と後を並べる。直した絵は前と後を並べ、「この絵にする」でこのテナントの差し替えに決める。
// 元の絵や前の版にいつでも戻せる（版は消さない）。決めるのは作者と監修者だけ。署名済みのカードの見た目も変わるので、使っている枚数を出してから決める
import { useCallback, useEffect, useMemo, useState } from "react";
import { assetPreviewSvg } from "../../shared/picto/asset-catalog";
import type { AssetGroup } from "../../shared/picto/asset-rules";
import type { View } from "../../shared/picto/character";
import { req } from "../make/MakeScreen";
import { authHeaders } from "../pin/TenantPin";
import { loadPropOverrides } from "./overrides";
import "./assets.css";

interface Item {
  kind: string;
  group: AssetGroup;
  /** 画面の名前（日本語） */
  name: string;
  /** 差し替えの中身（小物は SVG、服は 3 つの向きの JSON、表情は組み合わせの JSON） */
  active: { seq: number; svg: string } | null;
  versions: number;
  /** 使っている署名済みのカードの枚数。服は数えない（null） */
  signed: number | null;
}
interface Version {
  seq: number;
  svg: string;
  prompt: string;
  image: boolean;
  from_seq: number | null;
  actor: string;
  created_at: string;
}
type Filter = "all" | "changed" | "signed";
const GROUPS: [AssetGroup, string][] = [
  ["prop", "小物"],
  ["wear", "服"],
  ["face", "表情"],
];
const VIEW_JA: Record<View, string> = { front: "正面", quarter: "斜め", side: "真横" };
/** 服と表情は 3 つの向きで見る。小物は 1 つ */
const viewsOf = (g: AssetGroup): View[] => (g === "prop" ? ["front"] : ["front", "quarter", "side"]);
const PLACEHOLDER: Record<AssetGroup, string> = {
  prop: "例: 持ち手をもっと太く。現場で使っている黄色い工具箱の形に近づけて",
  wear: "例: 襟を立てて、胸に会社の印の丸を付けて",
  face: "例: 怒りをもう少し弱く、口は閉じて",
};
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX = 5 * 1024 * 1024;
const day = (s: string) => new Date(s).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const ACTOR: Record<string, string> = { author: "作者", supervisor: "監修者", trainer: "教育担当" };
const actorName = (a: string) => `${ACTOR[a.split(".")[0]] ?? a}${a.startsWith("supervisor") ? ` ${a.split(".")[1]}` : ""}`;

/** 見本の絵（自前の描き方で作った SVG。差し替えは使ってよい要素だけに絞ってある）。服と表情は view の向きで描く */
function Pic({ item, swap, label, view = "front" }: { item: Item; swap?: string | null; label?: string; view?: View }) {
  const kind = item.kind;
  const svg = useMemo(() => assetPreviewSvg(kind, swap, view), [kind, swap, view]);
  return <div className="asset-pic" role="img" aria-label={label ?? item.name} dangerouslySetInnerHTML={{ __html: svg }} />;
}
/** 向きごとの見本を横に並べる（小物は 1 つ） */
function Pics({ item, swap, label }: { item: Item; swap?: string | null; label?: string }) {
  return (
    <div className={item.group === "prop" ? "asset-views" : "asset-views multi"}>
      {viewsOf(item.group).map((v) => (
        <div key={v} className="asset-view">
          <Pic item={item} swap={swap} view={v} label={label && item.group !== "prop" ? `${label}（${VIEW_JA[v]}）` : label} />
          {item.group !== "prop" && <span className="asset-note">{VIEW_JA[v]}</span>}
        </div>
      ))}
    </div>
  );
}

function readImage(f: File): Promise<{ media_type: string; data: string; url: string }> {
  return new Promise((ok, ng) => {
    if (!IMAGE_TYPES.includes(f.type)) return ng(new Error("画像は png・jpg・webp"));
    if (f.size > IMAGE_MAX) return ng(new Error("画像は 5 MB まで"));
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      ok({ media_type: f.type, data: url.slice(url.indexOf(",") + 1), url });
    };
    r.onerror = () => ng(new Error("画像を読めなかった"));
    r.readAsDataURL(f);
  });
}

/** 差し替えると見た目が変わることの知らせ。空なら、署名済みのカードではまだ使っていない */
const warnText = (item: Item) =>
  item.signed === null
    ? "どのカードの人にも効きます（服は使っている枚数を数えていません）"
    : item.signed > 0
      ? `この${item.group === "face" ? "表情" : "小物"}を使っている署名済みのカード ${item.signed} 枚の見た目も変わります`
      : "";

function Detail({ tenant, item, canEdit, onChanged, onClose }: { tenant: string; item: Item; canEdit: boolean; onChanged: () => Promise<void>; onClose: () => void }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [active, setActive] = useState<number | null>(item.active?.seq ?? null);
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<{ media_type: string; data: string; url: string; name: string } | null>(null);
  const [draft, setDraft] = useState<{ seq: number; svg: string; note: string } | null>(null);
  const [busy, setBusy] = useState<"" | "fix" | "choose">("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const kind = item.kind;
  const warn = warnText(item);
  const load = useCallback(async () => {
    const b = await req<{ active: number | null; versions: Version[] }>(tenant, `/assets/${kind}/versions`);
    setVersions(b.versions);
    setActive(b.active);
  }, [tenant, kind]);
  useEffect(() => {
    load().catch((e: Error) => setErr(e.message));
  }, [load]);
  const now = versions?.find((v) => v.seq === active)?.svg ?? null;

  const fix = async () => {
    setBusy("fix");
    setErr("");
    setMsg("");
    try {
      const b = await req<{ seq: number; svg: string; note: string }>(tenant, `/assets/${kind}/fix`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, ...(image ? { image: { media_type: image.media_type, data: image.data } } : {}) }),
      });
      setDraft(b);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const choose = async (version: number | null, what: string) => {
    if (warn && !window.confirm(`${warn}。${what}か？`)) return;
    setBusy("choose");
    setErr("");
    try {
      await req(tenant, `/assets/${kind}/choose`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version }) });
      await loadPropOverrides(tenant, true);
      await load();
      await onChanged();
      setDraft(null);
      setMsg(version === null ? "元の絵に戻しました" : "この絵にしました");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const openImage = async (seq: number) => {
    const res = await fetch(`/api/t/${encodeURIComponent(tenant)}/assets/${kind}/image/${seq}`, { headers: authHeaders(tenant) });
    if (!res.ok) return setErr("画像を読めなかった");
    window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
  };

  return (
    <section className="asset-detail" data-testid="asset-detail" aria-label={`${item.name}の絵`}>
      <header className="asset-detail-head">
        <h2>
          {item.name} <span className="asset-kind">{kind}</span>
        </h2>
        <button type="button" className="pick" onClick={onClose} data-testid="asset-close">
          一覧に戻る
        </button>
      </header>
      <p className={warn ? "asset-warn" : "asset-note"} data-testid="asset-signed">
        {warn || "署名済みのカードではまだ使っていません"}
      </p>
      <div className="asset-compare">
        <figure>
          <Pics item={item} swap={now} />
          <figcaption>今の絵{now ? "（差し替え）" : "（元の絵）"}</figcaption>
        </figure>
        {draft && (
          <figure className="asset-after" data-testid="asset-draft">
            <Pics item={item} swap={draft.svg} label="直した絵" />
            <figcaption>直した絵（まだ決めていない）</figcaption>
          </figure>
        )}
      </div>
      {draft?.note && <p className="asset-note">Claude: {draft.note}</p>}
      {draft && canEdit && (
        <div className="asset-actions">
          <button type="button" className="big go" disabled={!!busy} onClick={() => void choose(draft.seq, "この絵にします")} data-testid="asset-choose">
            この絵にする
          </button>
          <button type="button" className="big" disabled={!!busy} onClick={() => setDraft(null)} data-testid="asset-cancel">
            やめる
          </button>
        </div>
      )}
      {canEdit ? (
        <form
          className="asset-form"
          onSubmit={(e) => {
            e.preventDefault();
            void fix();
          }}
        >
          <label>
            直したいこと
            <textarea rows={3} value={prompt} maxLength={2000} placeholder={PLACEHOLDER[item.group]} onChange={(e) => setPrompt(e.target.value)} data-testid="asset-prompt" />
          </label>
          <label className="asset-file">
            画像を添付（現場の写真・手描き。png・jpg・webp、5 MB まで）
            <input
              type="file"
              accept={IMAGE_TYPES.join(",")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) readImage(f).then((x) => setImage({ ...x, name: f.name }), (x: Error) => setErr(x.message));
              }}
              data-testid="asset-image"
            />
          </label>
          {image && (
            <p className="asset-attached" data-testid="asset-attached">
              <img src={image.url} alt="添付した画像" />
              {image.name}
              <button type="button" className="pick" onClick={() => setImage(null)}>
                外す
              </button>
            </p>
          )}
          <button className="big go" disabled={!!busy || !prompt.trim()} data-testid="asset-fix">
            {busy === "fix" ? "直しています…（1 分ほど）" : "直す"}
          </button>
        </form>
      ) : (
        <p className="asset-note">絵を直して決めるのは、作者と監修者です</p>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="saved" data-testid="asset-msg">{msg}</p>}
      <h3>版（新しい順・消さずに残す）</h3>
      {!versions ? (
        <p>読み込み中…</p>
      ) : (
        <ol className="asset-versions" data-testid="asset-versions">
          <li className={active === null ? "on" : ""}>
            <Pic item={item} swap={null} label="元の絵" />
            <div>
              <p>元の絵</p>
              {active === null ? <p className="asset-note">使っている</p> : canEdit && (
                <button type="button" className="pick" disabled={!!busy} onClick={() => void choose(null, "元の絵に戻します")} data-testid="asset-revert">
                  元の絵に戻す
                </button>
              )}
            </div>
          </li>
          {versions.map((v) => (
            <li key={v.seq} className={active === v.seq ? "on" : ""} data-testid={`asset-version-${v.seq}`}>
              <Pic item={item} swap={v.svg} label={`版 ${v.seq}`} />
              <div>
                <p>
                  {day(v.created_at)} ・ {actorName(v.actor)}
                </p>
                <p className="asset-prompt-text">「{v.prompt}」</p>
                {v.image && (
                  <button type="button" className="pick" onClick={() => void openImage(v.seq)}>
                    添付した画像を見る
                  </button>
                )}
                {active === v.seq ? <p className="asset-note">使っている</p> : canEdit && (
                  <button type="button" className="pick" disabled={!!busy} onClick={() => void choose(v.seq, "この版にします")} data-testid={`asset-use-${v.seq}`}>
                    この版にする
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AssetsTab({ tenant, role }: { tenant: string; role: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState<AssetGroup>("prop");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const b = await req<{ can_edit: boolean; assets: Item[] }>(tenant, "/assets");
    setItems(b.assets);
    setCanEdit(b.can_edit && (role === "author" || role === "supervisor"));
  }, [tenant, role]);
  useEffect(() => {
    load().catch((e: Error) => setErr(e.message));
    void loadPropOverrides(tenant);
  }, [load, tenant]);
  if (err) return <p className="err">{err}</p>;
  if (!items) return <p>読み込み中…</p>;
  const item = open ? items.find((x) => x.kind === open) : undefined;
  if (item) return <Detail tenant={tenant} item={item} canEdit={canEdit} onChanged={load} onClose={() => setOpen(null)} />;
  const word = q.trim().toLowerCase();
  const shown = items
    .filter((x) => x.group === group)
    .filter((x) => (filter === "changed" ? !!x.active : filter === "signed" ? (x.signed ?? 0) > 0 : true))
    .filter((x) => !word || x.kind.includes(word) || x.name.includes(q.trim()));
  return (
    <section className="assets" data-testid="assets">
      <p className="asset-note">カードの絵に使う小物・服・表情です。押すと、プロンプトや写真で直せます{canEdit ? "" : "（直して決めるのは作者と監修者）"}</p>
      <div className="av-seg" role="tablist" aria-label="アセットの種類">
        {GROUPS.map(([g, label]) => (
          <button key={g} role="tab" aria-selected={group === g} className={group === g ? "on" : ""} onClick={() => setGroup(g)} data-testid={`asset-group-${g}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="asset-tools">
        <div className="av-seg" role="tablist" aria-label="絞り込み">
          {(
            [
              ["all", "すべて"],
              ["changed", "差し替えたもの"],
              ["signed", "署名済みで使用"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)} data-testid={`asset-filter-${k}`}>
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          placeholder={group === "prop" ? "名前で探す（例: ヘルメット）" : group === "wear" ? "名前で探す（例: 背広）" : "名前で探す（例: 怒る）"}
          onChange={(e) => setQ(e.target.value)}
          data-testid="asset-search"
        />
      </div>
      <p className="asset-note">{shown.length} 個</p>
      <ul className="asset-grid">
        {shown.map((x) => (
          <li key={x.kind}>
            <button type="button" onClick={() => setOpen(x.kind)} data-testid={`asset-${x.kind}`}>
              <Pic item={x} swap={x.active?.svg ?? null} />
              <span className="asset-name">{x.name}</span>
              <span className="asset-tags">
                {x.active && <span className="asset-tag on">差し替え</span>}
                {(x.signed ?? 0) > 0 && <span className="asset-tag">署名済み {x.signed}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
