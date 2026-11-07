// 署名の入力（051b・工程 8）。監修者が OK のカードのその版に署名する。
// タブレットとスマホは指で名前を書き、パソコンは電子印鑑を押す（どちらにも切り替えられる）。書いた線と印は端末で PNG にして送り、
// サーバーは版・日付・中身のハッシュと一緒に、署名の絵のハッシュを監査の記録 ⑤ に残す（051a）。
// 監修者の名前はサーバーの環境変数から読み、無ければ空欄。署名すると「未承認の下書き」の帯が消える。
import { useEffect, useRef, useState } from "react";
import { type CardBody, type CardStatus, STATUS_LABEL } from "../../shared/card";
import { cutFrames } from "../../shared/picto/motion";
import { frameSvg } from "../Safe";
import { loadPropOverrides } from "../assets/overrides";
import { req } from "../make/MakeScreen";
import { SUPERVISORS, TenantPin, useNeedsTenantPin } from "../pin/TenantPin";
import "./sign.css";

interface CardView {
  id: string;
  status: CardStatus;
  version: number;
  body: CardBody;
}
interface Me {
  role: string | null;
  slot?: number;
  name?: string;
}
type Kind = "finger" | "stamp";
const FINGER_MIN = 120;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/** 監修者の役で入る（会社のテナントは役割の PIN が要る） */
function SupervisorPick({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  // 会社のテナントで入ったしるしが無ければ、テナントの PIN → 監修者の PIN の 2 段で入る
  const [needPin] = useNeedsTenantPin(tenant);
  const [people, setPeople] = useState<{ role: string; slot: number; name: string }[]>([]);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    req<{ people: { role: string; slot: number; name: string }[] }>(tenant, "/people").then(
      (p) => setPeople(p.people.filter((x) => x.role === "supervisor")),
      (e: Error) => setErr(e.message),
    );
  }, [tenant]);
  const go = async (slot: number) => {
    setErr("");
    try {
      const { token } = await req<{ token: string }>(tenant, "/login", { method: "POST", body: JSON.stringify({ role: "supervisor", slot, pin: pin || undefined }) });
      try {
        sessionStorage.setItem(`role:${tenant}`, token);
      } catch {
        throw new Error("この端末では入ったしるしを残せない");
      }
      // 役割で入ったら差し替えを読む（同じ画面のまま入るので、道筋の変わりを待たない）
      void loadPropOverrides(tenant);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (needPin === null) return <p>読み込み中…</p>;
  if (needPin) return <TenantPin tenant={tenant} roles={SUPERVISORS} onDone={onDone} />;
  return (
    <section className="sign-pick" data-testid="sign-pick">
      <h1>署名は監修者の役で行います</h1>
      <label>
        PIN（会社のテナントだけ）
        <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" />
      </label>
      <div className="sign-row">
        {people.map((p) => (
          <button key={p.slot} className="big" onClick={() => go(p.slot)} data-testid={`sign-as-${p.slot}`}>
            監修者 {p.slot}
            {p.name ? `（${p.name}）` : ""}
          </button>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

/** 指で書く欄。線の長さが足りれば PNG を返す */
function FingerPad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<[number, number] | null>(null);
  const length = useRef(0);
  const at = (e: React.PointerEvent): [number, number] => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
  };
  const clear = () => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    length.current = 0;
    onChange(null);
  };
  useEffect(clear, []);
  return (
    <div className="sign-pad-wrap">
      <canvas
        ref={ref}
        className="sign-pad"
        width={720}
        height={240}
        data-testid="sign-pad"
        onPointerDown={(e) => {
          last.current = at(e);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // 捕まえられない指（すでに離れた等）でも、線は引ける
          }
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const p = at(e);
          const g = ref.current!.getContext("2d")!;
          g.strokeStyle = "#111";
          g.lineWidth = 6;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(...last.current);
          g.lineTo(...p);
          g.stroke();
          length.current += Math.hypot(p[0] - last.current[0], p[1] - last.current[1]);
          last.current = p;
        }}
        onPointerUp={() => {
          last.current = null;
          onChange(length.current >= FINGER_MIN ? ref.current!.toDataURL("image/png") : null);
        }}
      />
      <button className="card-show" onClick={clear} data-testid="sign-clear">
        書き直す
      </button>
    </div>
  );
}

/** 電子印鑑。役と名前（無ければ空欄）と日付を朱の丸に入れる */
function Stamp({ name, pressed, onPress }: { name: string; pressed: boolean; onPress: (png: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = g.fillStyle = "#c22";
    g.lineWidth = 8;
    g.beginPath();
    g.arc(120, 120, 108, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    for (const y of [86, 154]) {
      g.beginPath();
      g.moveTo(26, y);
      g.lineTo(214, y);
      g.stroke();
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "bold 26px system-ui, sans-serif";
    g.fillText("監修者", 120, 58);
    g.font = "bold 34px system-ui, sans-serif";
    g.fillText(name, 120, 120);
    g.font = "bold 24px system-ui, sans-serif";
    g.fillText(today(), 120, 182);
  }, [name]);
  return (
    <div className="sign-stamp-wrap">
      <canvas ref={ref} className={`sign-stamp${pressed ? " on" : ""}`} width={240} height={240} data-testid="sign-stamp" />
      <button className="big" onClick={() => onPress(ref.current!.toDataURL("image/png"))} data-testid="sign-press">
        {pressed ? "押しました（押し直す）" : "印鑑を押す"}
      </button>
    </div>
  );
}

export function SignScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [card, setCard] = useState<CardView | null>(null);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<Kind>(() => (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? "finger" : "stamp"));
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ version: number; signed_at: string } | null>(null);
  const [tries, setTries] = useState(0);
  const path = `/cards/${encodeURIComponent(cardId)}`;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // 古いか壊れた役のしるしは捨てて、監修者で入り直す
        const m = await req<Me>(tenant, "/me").catch(() => {
          sessionStorage.removeItem(`role:${tenant}`);
          return { role: null } as Me;
        });
        if (!live) return;
        setMe(m);
        if (m.role !== "supervisor") return;
        const c = await req<CardView>(tenant, path);
        if (!live) return;
        setCard(c);
        // その版を最初に開いた時刻を残す（「1 枚 ○分」の元）
        if (c.status === "ok") await req(tenant, `${path}/open`, { method: "POST", body: "{}" });
      } catch (e) {
        if (live) setErr((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [tenant, path, tries]);

  if (err && !card) return <p className="err">{err}</p>;
  if (!me) return <p>読み込み中…</p>;
  if (me.role !== "supervisor") return <SupervisorPick tenant={tenant} onDone={() => setTries((t) => t + 1)} />;
  if (!card) return <p>読み込み中…</p>;
  const b = card.body;
  const frames = b.motion.kind === "keyframes" ? cutFrames(b.motion.json) : [];
  const pick = (k: Kind) => {
    setKind(k);
    setPng(null);
  };
  const sign = async () => {
    setBusy(true);
    setErr("");
    try {
      setDone(await req<{ version: number; signed_at: string }>(tenant, `${path}/sign`, { method: "POST", body: JSON.stringify({ version: card.version, mark: { kind, png } }) }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="sign" data-testid="sign" data-status={done ? "signed" : card.status}>
      <header className="sign-head">
        <p>
          版 {card.version}・{done ? STATUS_LABEL.signed : STATUS_LABEL[card.status]}
        </p>
        <h1>{b.rule}</h1>
        <p className="done">なぜ: {b.why}</p>
      </header>
      <ol className="sign-frames">
        {frames.map(({ t, frame }) => (
          <li key={t} dangerouslySetInnerHTML={{ __html: frameSvg(frame) }} />
        ))}
      </ol>
      {done ? (
        <section className="sign-done" data-testid="sign-done">
          <h2>署名しました</h2>
          <p>
            版 {done.version}・{new Date(done.signed_at).toLocaleString("ja-JP")}。監査の記録 ⑤ に残りました。
          </p>
          <a className="big go" href={`#/t/${encodeURIComponent(tenant)}/card/${encodeURIComponent(card.id)}`} data-testid="sign-to-card">
            カードを見る
          </a>
        </section>
      ) : card.status !== "ok" ? (
        <p className="sign-wait" data-testid="sign-wait">
          署名できるのは OK のカードだけです（今は {STATUS_LABEL[card.status]}）
        </p>
      ) : (
        <section className="sign-input" data-testid="sign-input" data-kind={kind}>
          <div className="sign-row">
            <button className={`pick${kind === "finger" ? " on" : ""}`} onClick={() => pick("finger")} data-testid="sign-kind-finger">
              指で書く
            </button>
            <button className={`pick${kind === "stamp" ? " on" : ""}`} onClick={() => pick("stamp")} data-testid="sign-kind-stamp">
              電子印鑑
            </button>
          </div>
          {kind === "finger" ? <FingerPad onChange={setPng} /> : <Stamp name={me.name ?? ""} pressed={!!png} onPress={setPng} />}
          <button className="big go" disabled={!png || busy} onClick={sign} data-testid="sign-submit">
            {busy ? "署名しています…" : png ? `版 ${card.version} に署名する` : kind === "finger" ? "名前を書くと署名できます" : "印鑑を押すと署名できます"}
          </button>
        </section>
      )}
      {err && <p className="err">{err}</p>}
    </article>
  );
}
