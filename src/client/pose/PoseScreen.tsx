// 絵の部品を 1 つずつ動かす画面（091）。監修者がコマを選び、絵の部品（人・時計・小物）をタップするか一覧から選び、
// つまみで角度と位置を動かす。動かした値はその場で絵と JSON に出る。保存すると版が 1 つ上がり、直しの記録 ④ に前後が残る（050）。
// 変えられるのは選んだ部品の値だけなので、部品 → 文 → 元の文の経路は保たれる。
import { useEffect, useMemo, useState } from "react";
import { partBoxes } from "../../shared/boxes";
import type { CardBody } from "../../shared/card";
import { type FigurePatch, movePart, partJson, type PropPatch, SIZE_RANGE } from "../../shared/move";
import { frameAt, type MotionJson } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";
import { BONE_RANGE, BONES, type Bone } from "../../shared/picto/skeleton";
import { keyIndexAt } from "../../shared/redo";
import { req } from "../make/MakeScreen";
import "./pose.css";

interface CardView {
  id: string;
  status: string;
  version: number;
  body: CardBody;
}

const BONE_LABEL: Record<Bone, string> = {
  torso: "胴",
  neck: "首",
  arm_near_upper: "手前の腕（肩）",
  arm_near_lower: "手前の腕（ひじ）",
  arm_far_upper: "奥の腕（肩）",
  arm_far_lower: "奥の腕（ひじ）",
  leg_near_upper: "手前の脚（もも）",
  leg_near_lower: "手前の脚（ひざ）",
  leg_far_upper: "奥の脚（もも）",
  leg_far_lower: "奥の脚（ひざ）",
};

function Slider({ id, label, value, min, max, step, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="pose-slider">
      <span>
        {label} <b>{Math.round(value * 100) / 100}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={`pose-${id}`} />
    </label>
  );
}

export function PoseScreen({ tenant, cardId }: { tenant: string; cardId: string }) {
  const [card, setCard] = useState<CardView | null>(null);
  const [json, setJson] = useState<MotionJson | null>(null);
  const [at, setAt] = useState(0);
  const [part, setPart] = useState<string | null>(null);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const path = `/cards/${encodeURIComponent(cardId)}`;

  useEffect(() => {
    req<CardView>(tenant, path).then(
      (c) => {
        setCard(c);
        if (c.body.motion.kind === "keyframes") setJson(c.body.motion.json);
      },
      (e: Error) => setErr(e.message),
    );
  }, [tenant, path]);

  const t = card?.body.frames[at]?.t ?? 0;
  const boxes = useMemo(() => (json && card ? partBoxes(json, t, card.body.parts) : []), [json, card, t]);
  if (err && !card) return <p className="err">{err}</p>;
  if (!card) return <p>読み込み中…</p>;
  if (!json) return <p className="done">この絵は部品ごとに動かせない（動きの HTML）</p>;
  const keyIndex = keyIndexAt(json, t);
  const sel = card.body.parts.find((p) => p.id === part);
  const target = sel && sel.target.type !== "element" ? sel.target : null;
  const now = target ? partJson(json, keyIndex, target) : null;
  const num = (now ?? {}) as Record<string, number>;
  const move = (patch: FigurePatch | PropPatch) => {
    setJson(movePart(json, keyIndex, target!, patch));
    setMoved((s) => new Set(s).add(part!));
    setSaved(null);
  };
  // タップした点に重なる部品のうち、いちばん小さい箱を選ぶ（手に持った小物を人より先に取る）
  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const [x, y] = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    const hit = boxes.filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (hit) setPart(hit.part);
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const body: CardBody = { ...card.body, motion: { kind: "keyframes", json } };
      const out = await req<CardView>(tenant, path, { method: "PUT", body: JSON.stringify({ card: body, reason: `部品を動かす: ${[...moved].join("・")}（${at + 1} コマ目）` }) });
      setCard(out);
      setMoved(new Set());
      setSaved(out.version);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="pose" data-testid="pose" data-version={card.version}>
      <nav className="pose-frames" aria-label="コマ">
        {card.body.frames.map((f, j) => (
          <button key={f.t} className={`pick${j === at ? " on" : ""}`} onClick={() => setAt(j)} data-testid={`pose-frame-${j}`}>
            {j + 1} コマ目
          </button>
        ))}
      </nav>
      <div className="pose-main">
        <div className="pose-face" onClick={tap} data-testid="pose-face">
          <span dangerouslySetInnerHTML={{ __html: renderFrame(frameAt(json, t)).svg }} />
          {boxes
            .filter((b) => b.part === part)
            .map((b) => (
              <i key={b.part} className="pose-box" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />
            ))}
        </div>
        <div className="pose-side">
          <div className="pose-parts">
            {card.body.parts.map((p) => (
              <button key={p.id} className={`pick${p.id === part ? " on" : ""}`} onClick={() => setPart(p.id)} data-testid={`pose-part-${p.id}`}>
                {p.reason}
                {moved.has(p.id) ? "（動かした）" : ""}
              </button>
            ))}
          </div>
          {target && now && (
            <section className="pose-controls" data-testid="pose-controls" data-part={part!}>
              {target.type === "figure" ? (
                <>
                  <Slider id="x" label="横の位置" value={(now as { x: number }).x} min={0} max={1} step={0.01} onChange={(v) => move({ x: v })} />
                  {BONES.map((b) => (
                    <Slider key={b} id={b} label={BONE_LABEL[b]} value={(now as { angles: Record<Bone, number> }).angles[b]} min={BONE_RANGE[b][0]} max={BONE_RANGE[b][1]} step={1} onChange={(v) => move({ angles: { [b]: v } })} />
                  ))}
                </>
              ) : "dx" in now ? (
                <>
                  <Slider id="dx" label="手元からのずれ（横）" value={num.dx} min={-1} max={1} step={0.01} onChange={(v) => move({ dx: v })} />
                  <Slider id="dy" label="手元からのずれ（縦）" value={num.dy} min={-1} max={1} step={0.01} onChange={(v) => move({ dy: v })} />
                  <Slider id="size" label="大きさ" value={num.size} min={SIZE_RANGE[0]} max={SIZE_RANGE[1]} step={0.01} onChange={(v) => move({ size: v })} />
                </>
              ) : (
                <>
                  <Slider id="x" label="横の位置" value={(now as { x: number }).x} min={0} max={1} step={0.01} onChange={(v) => move({ x: v })} />
                  <Slider id="y" label="縦の位置" value={(now as { y: number }).y} min={0} max={1} step={0.01} onChange={(v) => move({ y: v })} />
                  <Slider id="size" label="大きさ" value={num.size} min={SIZE_RANGE[0]} max={SIZE_RANGE[1]} step={0.01} onChange={(v) => move({ size: v })} />
                </>
              )}
              <pre className="pose-json" data-testid="pose-json">
                {JSON.stringify(now)}
              </pre>
            </section>
          )}
          <button className="big go" disabled={!moved.size || busy} onClick={save} data-testid="pose-save">
            {busy ? "保存しています…" : moved.size ? `動かした ${moved.size} つを保存する` : "部品を選んで動かす"}
          </button>
          {saved && (
            <p className="saved" data-testid="pose-saved">
              版 {saved} にしました。直しの記録 ④ に前後が残り、確かめる AI に見せ直すまで確認待ちです
            </p>
          )}
          {err && <p className="err">{err}</p>}
        </div>
      </div>
    </article>
  );
}
