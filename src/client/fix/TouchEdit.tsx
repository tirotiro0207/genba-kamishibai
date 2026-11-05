// 直す画面の「指で直す」（11/6）。監修者がタブレットで、絵の部品（人・小物・印）をタップして選ぶと枠が出る。
// 選んだ部品を 1 本指で引くと動き、小物は 2 本指で広げる・縮めると大きさが変わる。人は「左右を入れかえる」で向きを変える。
// 書き込む値は部品を 1 つずつ動かす画面（091）のつまみと同じ（人の横の位置と向き、小物の位置・ずれ・大きさ）なので、
// 部品 → 文 → 元の文の経路は保たれる。保存すると版が 1 つ上がり、直しの記録 ④ に前後が残る。
import { useMemo, useRef, useState } from "react";
import { partBoxes } from "../../shared/boxes";
import type { CardBody } from "../../shared/card";
import { dragPatch, movePart, type Target, pinchPatch } from "../../shared/move";
import { frameAt, type MotionJson } from "../../shared/picto/motion";
import { renderFrame } from "../../shared/picto/scene";
import { keyIndexAt } from "../../shared/redo";

type Pt = { x: number; y: number };
type Grab = { id: string; json: MotionJson; target: Target; pts: Map<number, Pt>; start: Map<number, Pt> };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function TouchEdit({ body, at, busy, onSave }: { body: CardBody; at: number; busy: boolean; onSave: (json: MotionJson, reason: string) => void }) {
  const start = body.motion.kind === "keyframes" ? body.motion.json : null;
  const [json, setJson] = useState<MotionJson | null>(start);
  const [part, setPart] = useState<string | null>(null);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const grab = useRef<Grab | null>(null);
  const t = body.frames[at]?.t ?? 0;
  const boxes = useMemo(() => (json ? partBoxes(json, t, body.parts) : []), [json, t, body.parts]);
  if (!json || !start) return <p className="done">この絵は指で直せない（動きの HTML）</p>;
  const keyIndex = keyIndexAt(json, t);
  const targetOf = (id: string | null) => {
    const p = body.parts.find((x) => x.id === id);
    return p && p.target.type !== "element" ? (p.target as Target) : null;
  };
  const sel = targetOf(part);
  const label = (id: string) => body.parts.find((p) => p.id === id)?.reason ?? id;
  const at01 = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  // 触った点に重なる部品のうち、いちばん小さい箱（手に持った小物を人より先に取る）
  const hit = (p: Pt) => boxes.filter((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]?.part ?? null;
  const touched = (id: string) => setMoved((s) => new Set(s).add(id));

  const down = (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 捕まえられない指は、絵の上だけで追う
    }
    const p = at01(e);
    const g = grab.current;
    if (g) {
      // 2 本目の指: 選んだ部品のまま、大きさの操作に入る
      g.pts.set(e.pointerId, p);
      g.start = new Map(g.pts);
      g.json = json;
      return;
    }
    const id = hit(p);
    if (!id) return;
    setPart(id);
    const target = targetOf(id);
    if (!target) return;
    grab.current = { id, json, target, pts: new Map([[e.pointerId, p]]), start: new Map([[e.pointerId, p]]) };
  };
  const move = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || !g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, at01(e));
    const ids = [...g.pts.keys()];
    let next: MotionJson;
    if (ids.length >= 2) {
      const [a, b] = ids;
      const patch = pinchPatch(g.json, keyIndex, g.target, dist(g.pts.get(a)!, g.pts.get(b)!) / Math.max(1e-6, dist(g.start.get(a)!, g.start.get(b)!)));
      if (!patch) return;
      next = movePart(g.json, keyIndex, g.target, patch);
    } else {
      const s = g.start.get(e.pointerId)!;
      const p = g.pts.get(e.pointerId)!;
      next = movePart(g.json, keyIndex, g.target, dragPatch(g.json, t, keyIndex, g.target, p.x - s.x, p.y - s.y));
    }
    setJson(next);
    touched(g.id);
  };
  const up = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g) return;
    g.pts.delete(e.pointerId);
    if (!g.pts.size) grab.current = null;
    else {
      // 1 本残ったら、その指から引き直す
      g.start = new Map(g.pts);
      g.json = json;
    }
  };
  const flip = () => {
    if (!sel || sel.type !== "figure") return;
    const f = json.keyframes[keyIndex].figures[sel.index];
    setJson(movePart(json, keyIndex, sel, { facing: f.facing === "left" ? "right" : "left" }));
    touched(part!);
  };
  const reset = () => {
    setJson(start);
    setMoved(new Set());
  };
  const names = [...moved].filter(Boolean);
  const value = (tg: Target) =>
    tg.type === "figure" ? (({ x, facing }) => ({ x, facing }))(json.keyframes[keyIndex].figures[tg.index]) : (({ kind, dx, dy, x, y, size }) => ({ kind, dx, dy, x, y, size }))(json.keyframes[keyIndex].props[tg.index]);

  return (
    <div className="fix-main">
      <div ref={ref} className="fix-face touch" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="touch-face">
        <span dangerouslySetInnerHTML={{ __html: renderFrame(frameAt(json, t)).svg }} />
        {boxes
          .filter((b) => b.part === part)
          .map((b) => (
            <i key={b.part} className="touch-box" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} data-testid="touch-box" />
          ))}
      </div>
      <div className="fix-side">
        <p className="done" data-testid="touch-help">
          {part ? `選んだ部品: ${label(part)}。1 本指で引くと動く${sel?.type === "prop" ? "。2 本指で広げると大きく、縮めると小さくなる" : ""}` : "直したい部品（人・小物・印）をタップして選ぶ"}
        </p>
        {sel?.type === "figure" && (
          <button className="big" onClick={flip} data-testid="touch-flip">
            向きを左右に入れかえる
          </button>
        )}
        {/* 監修者には言葉だけを見せる（11/6 本部: 数字の列は出さない）。値は data-value に置き、試験と開発のときに読む */}
        {sel && (
          <p className="touch-state" data-testid="touch-json" data-part={part ?? ""} data-value={JSON.stringify(value(sel))}>
            {sel.type === "figure"
              ? `向き: ${json.keyframes[keyIndex].figures[sel.index].facing === "right" ? "右向き" : "左向き"}${moved.has(part ?? "") ? "（動かした）" : ""}`
              : `大きさ ${Math.round(json.keyframes[keyIndex].props[sel.index].size * 100)}%${moved.has(part ?? "") ? "（動かした）" : ""}`}
          </p>
        )}
        <div className="fix-nav">
          <button className="big" disabled={!names.length || busy} onClick={reset} data-testid="touch-reset">
            保存する前に戻す
          </button>
          <button className="big go" disabled={!names.length || busy} onClick={() => onSave(json, `指で動かす: ${names.join("・")}（${at + 1} コマ目）`)} data-testid="touch-save">
            {busy ? "保存しています…" : names.length ? `動かした ${names.length} つを保存する` : "部品を選んで動かす"}
          </button>
        </div>
      </div>
    </div>
  );
}
