// 背景の調整の板（11/7 作者）。右下のペンのボタンで開き、つまみを動かすとその場で背景が変わる。
// 手元（localhost）のホームだけに出す。自動の試験・録画（navigator.webdriver）には出さない
import { useEffect, useState } from "react";
import { FLOW_DEFAULTS, type FlowTune, flowTune, onFlowTune, resetFlowTune, revertFlowTune, saveFlowTune, setFlowTune } from "./flowTune";

const KNOBS: { key: keyof FlowTune; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: "dim", label: "字の上の黒い膜", min: 0, max: 1, step: 0.01 },
  { key: "main", label: "中身の地の黒", min: 0, max: 1, step: 0.01 },
  { key: "panel", label: "枠の黒（すりガラス）", min: 0, max: 1, step: 0.01 },
  { key: "blur", label: "枠のぼかし", min: 0, max: 40, step: 1, unit: "px" },
  { key: "door", label: "扉の中の灰色", min: 0, max: 1, step: 0.01 },
  { key: "glow", label: "縁のネオンの光", min: 0, max: 15, step: 0.5, unit: "px" },
  { key: "gap", label: "字の間（字の大きさに対して）", min: 0.1, max: 2, step: 0.05 },
  { key: "cross", label: "画面を渡り切る秒", min: 10, max: 120, step: 1, unit: "秒" },
];

export const showFlowTuner = () => typeof location !== "undefined" && location.hostname === "localhost" && !navigator.webdriver;

export function FlowTuner() {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(flowTune);
  const [saved, setSaved] = useState("");
  useEffect(() => onFlowTune(setT), []);
  const pct = (k: keyof FlowTune) => (KNOBS.find((x) => x.key === k)!.max === 1 ? `${Math.round(t[k] * 100)}%` : `${t[k]}${KNOBS.find((x) => x.key === k)!.unit ?? ""}`);
  return (
    <div className="flow-tuner" data-testid="flow-tuner">
      {open && (
        <div className="flow-tuner-panel">
          <b>背景の調整（手元だけ）</b>
          {KNOBS.map((k) => (
            <label key={k.key}>
              <span>
                {k.label} <em>{pct(k.key)}</em>
              </span>
              <input type="range" min={k.min} max={k.max} step={k.step} value={t[k.key]} onChange={(e) => setFlowTune({ ...t, [k.key]: Number(e.target.value) })} />
            </label>
          ))}
          <div className="flow-tuner-row">
            <button type="button" className="go" onClick={() => setSaved(saveFlowTune() ? "保存しました" : "保存できませんでした")}>
              保存
            </button>
            <button type="button" onClick={revertFlowTune}>
              保存した値に戻す
            </button>
            <button type="button" onClick={resetFlowTune}>
              最初の値
            </button>
          </div>
          {saved && <small>{saved}</small>}
          <small className="flow-tuner-vals">{JSON.stringify(Object.fromEntries(Object.keys(FLOW_DEFAULTS).map((k) => [k, t[k as keyof FlowTune]])))}</small>
        </div>
      )}
      <button type="button" className="flow-tuner-pen" aria-label="背景を調整する" title="背景を調整する" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M4 20h4L19 9l-4-4L4 16v4z M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
