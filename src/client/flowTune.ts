// 背景の濃さ・ぼかし・字の間・速さを、手元で動かしながら決めるための値（11/7 作者「パラメーターを自分で動かして、リアルタイムに見たい」）。
// 決めた値は、作者の OK のあと app.css と FlowBackdrop.tsx の既定に書き写す。ここは手元の調整のためだけで、保存はこのブラウザーの中だけ
export interface FlowTune {
  /** 字の上の黒い膜（0〜1） */
  dim: number;
  /** 画面いっぱいの中身の地の黒（0〜1） */
  main: number;
  /** 「どちらで入りますか」の枠の黒（0〜1） */
  panel: number;
  /** 枠のぼかし（px） */
  blur: number;
  /** 扉の中の濃い灰色（0〜1） */
  door: number;
  /** 字の並びの後ろの空白（字の大きさに対する比） */
  gap: number;
  /** 画面の対角を渡り切る秒 */
  cross: number;
  /** 字の縁のネオンの光のにじみ（px。0 で光らせない） */
  glow: number;
}

/** 既定は 11/7 に作者が調整の板で決めて保存した値 */
export const FLOW_DEFAULTS: FlowTune = { dim: 0.39, main: 0.22, panel: 0.69, blur: 6, door: 0.61, gap: 0.7, cross: 73, glow: 4 };
const KEY = "flow-tune";

const read = (): FlowTune => {
  try {
    return { ...FLOW_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<FlowTune>) };
  } catch {
    return { ...FLOW_DEFAULTS };
  }
};

let now: FlowTune = read();
const subs = new Set<(t: FlowTune) => void>();

function paint(t: FlowTune) {
  const s = document.documentElement.style;
  s.setProperty("--flow-dim", String(t.dim));
  s.setProperty("--flow-main", String(t.main));
  s.setProperty("--flow-panel", String(t.panel));
  s.setProperty("--flow-blur", `${t.blur}px`);
  s.setProperty("--flow-door", String(t.door));
}
paint(now);

export const flowTune = () => now;
export function setFlowTune(t: FlowTune) {
  now = t;
  paint(t);
  for (const f of subs) f(t);
}
export function onFlowTune(f: (t: FlowTune) => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
export function saveFlowTune() {
  try {
    localStorage.setItem(KEY, JSON.stringify(now));
    return true;
  } catch {
    return false;
  }
}
/** 保存した値（無ければ既定）に戻す */
export const revertFlowTune = () => setFlowTune(read());
export const resetFlowTune = () => setFlowTune({ ...FLOW_DEFAULTS });
