// 折り紙 ①（紙 → 紙の人）の手順と、折る動き。
// 手順は手本の動画の折り方（脚の紙 11・体の紙 18・組む 2・仕上げ 5）を、直線だけの多角形に描き起こしたもの。
// 1 手順は「そのあとの紙の層」と、そこで折れる「フラップ」（折ったあとの形・折り線）で書く。
// フラップの折る前の形は、折ったあとの形を折り線で裏返して求める。動きは、折り線を軸に面が回る（見かけの幅が cos で縮み、半分を越えると裏の面が見える）
import React from "react";
import { PAPER, PAPER_EDGE, PAPER_FAR, type Pt, TorsoPattern } from "./paper";
import { INK } from "./timeline";

export type Shade = 0 | 1 | 2; // 0 表（刷った面）・1 裏（少し暗いクリーム）・2 重なり（もう 1 段暗い）
export interface Layer { poly: Pt[]; shade: Shade; /** 表の面の塗り（無ければ紙の柄） */ fill?: string }
export interface Flap extends Layer { line: [Pt, Pt]; /** 折って、すぐ開く（折り筋だけが残る） */ open?: boolean }
export interface Step { id: string; label: string; layers: Layer[]; flaps?: Flap[]; creases?: [Pt, Pt][]; /** 裏返す */ flip?: boolean }

const D = 141.4; // 正方形 200 の対角の半分
const lay = (poly: Pt[], shade: Shade = 0, fill?: string): Layer => ({ poly, shade, fill });
const mx = (poly: Pt[]): Pt[] => poly.map(([x, y]) => [-x, y] as Pt).reverse();
const sym = (half: Pt[]): Pt[] => [...half, ...mx(half).filter((p) => !half.some((q) => q[0] === p[0] && q[1] === p[1]))];
const at = (poly: Pt[], dx: number, dy: number): Pt[] => poly.map(([x, y]) => [x + dx, y + dy] as Pt);

// ---- 脚の紙（1 枚目） ----
const SQ: Pt[] = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
const DIA: Pt[] = [[0, -D], [D, 0], [0, D], [-D, 0]];
const P1: Pt = [82.6, -58.4]; // 下の角から右下の辺を中心へ折る折り線が、右上の辺に当たる所
const SLIM: Pt[] = [[0, -D], [58.4, 0], [0, D], [-58.4, 0]];
const LEGS: Pt[] = [[-18, -70], [18, -70], [22, 150], [5, 150], [0, 18], [-5, 150], [-22, 150]];
export const LEG_STEPS: Step[] = [
  { id: "L1", label: "正方形", layers: [lay(SQ)] },
  { id: "L2", label: "対角に折る", layers: [lay([[-100, -100], [100, -100], [-100, 100]])], flaps: [{ poly: [[-100, -100], [100, -100], [-100, 100]], shade: 1, line: [[100, -100], [-100, 100]] }] },
  { id: "L3", label: "開いて右下を中心へ", layers: [lay([[0, -D], P1, [0, D], [-D, 0]])], flaps: [{ poly: [[0, D], [0, -58.6], P1], shade: 1, line: [[0, D], P1] }], creases: [[[0, -D], [0, D]]] },
  { id: "L4", label: "左上も中心へ", layers: [lay([[0, -D], P1, [0, D], [-82.6, 58.4]]), lay([[0, D], [0, -58.6], P1], 1)], flaps: [{ poly: [[0, -D], [0, 58.6], [-82.6, 58.4]], shade: 1, line: [[0, -D], [-82.6, 58.4]] }], creases: [[[0, -D], [0, D]]] },
  { id: "L5", label: "残りの 2 辺も中心へ", layers: [lay(SLIM, 1)], flaps: [{ poly: [[0, D], [0, 0], [-58.4, 0]], shade: 1, line: [[0, D], [-82.6, -58.4]] }, { poly: [[0, -D], [0, 0], [58.4, 0]], shade: 1, line: [[0, -D], [82.6, 58.4]] }], creases: [[[0, -D], [0, D]], [[-58.4, 0], [58.4, 0]]] },
  { id: "L6", label: "半分に折る", layers: [lay([[0, -D], [58.4, 0], [0, D]], 1)], flaps: [{ poly: [[0, -D], [58.4, 0], [0, D]], shade: 2, line: [[0, -D], [0, D]] }] },
  { id: "L7", label: "横にして、縦の折り筋", layers: [lay([[-D, 0], [0, -58.4], [D, 0]], 2)], creases: [[[0, -58.4], [0, 0]]] },
  { id: "L8", label: "斜めの辺を中心へ", layers: [lay([[0, -70], [30, -20], [0, 150], [-30, -20]], 2)], creases: [[[0, -70], [0, 150]]] },
  { id: "L9", label: "もう一度中心へ", layers: [lay([[0, -70], [20, -20], [0, 150], [-20, -20]], 2)], creases: [[[0, -70], [0, 150]]] },
  { id: "L10", label: "左を中割り", layers: [lay([[-18, -70], [18, -70], [16, 150], [0, 150], [0, 18], [-24, 140], [-38, 128]], 2)], creases: [[[0, -70], [0, 18]]] },
  { id: "L11", label: "右も中割り（2 本の脚）", layers: [lay(LEGS, 2)], creases: [[[0, -70], [0, 18]], [[-18, -40], [18, -40]]] },
];

// ---- 体の紙（2 枚目） ----
const B_P: Pt = [82.6, -58.4];
const ARMS_BASE = (head: Pt[]): Pt[] => [...head, [32, -60], [105, -56], [105, -36], [28, -34], [26, 105], [-26, 105], [-28, -34], [-105, -36], [-105, -56], [-32, -60], ...mx(head)];
const HEAD_POINT: Pt[] = [[0, -160], [22, -80]];
const HEAD_SQ: Pt[] = [[-22, -130], [22, -130], [22, -80]];
const HEAD_CUT: Pt[] = [[-16, -130], [16, -130], [24, -118], [22, -80]];
export const BODY_STEPS: Step[] = [
  { id: "B1", label: "× の折り筋", layers: [lay(SQ)], creases: [[[-100, -100], [100, 100]], [[100, -100], [-100, 100]]] },
  { id: "B2", label: "下の 2 辺を中心へ", layers: [lay([[0, -D], B_P, [0, D], [-82.6, -58.4]])], flaps: [{ poly: [[0, D], [0, -58.6], B_P], shade: 1, line: [[0, D], B_P] }, { poly: [[0, D], [-82.6, -58.4], [0, -58.6]], shade: 1, line: [[0, D], [-82.6, -58.4]] }], creases: [[[0, -D], [0, D]]] },
  { id: "B3", label: "上を下へ折って、全部開く", layers: [lay(DIA)], creases: [[[0, -D], [0, D]], [[-D, 0], [D, 0]], [[0, D], B_P], [[0, D], [-82.6, -58.4]], [[-82.6, -58.4], B_P]] },
  { id: "B4", label: "上の角を折って開く", layers: [lay(DIA)], flaps: [{ poly: [[-70.7, -70.7], [70.7, -70.7], [0, 0]], shade: 1, line: [[-70.7, -70.7], [70.7, -70.7]], open: true }], creases: [[[0, -D], [0, D]], [[-D, 0], [D, 0]], [[-70.7, -70.7], [70.7, -70.7]], [[-70.7, 70.7], [70.7, 70.7]]] },
  { id: "B5", label: "右の角を閉じて下へ", layers: [lay([[0, -D], [60, -60], [100, 50], [40, 10], [0, D], [-D, 0]])], flaps: [{ poly: [[60, -60], [100, 50], [40, 10]], shade: 1, line: [[60, -60], [40, 10]] }], creases: [[[0, -D], [0, D]]] },
  { id: "B6", label: "左も同じ（矢じり）", layers: [lay(sym([[0, -D], [60, -60], [100, 50], [40, 10], [0, 90]]))], flaps: [{ poly: [[-60, -60], [-40, 10], [-100, 50]], shade: 1, line: [[-60, -60], [-40, 10]] }], creases: [[[0, -D], [0, 90]]] },
  { id: "B7", label: "左の角を中割り", layers: [lay([[0, -D], [60, -60], [100, 50], [40, 10], [0, 90], [-40, 10], [-78, 85], [-60, -60]])], creases: [[[0, -D], [0, 90]]] },
  { id: "B8", label: "右の角も中割り", layers: [lay(sym([[0, -D], [60, -60], [78, 85], [40, 10], [0, 90]]))], creases: [[[0, -D], [0, 90]]] },
  { id: "B9", label: "上の層を開いてつぶす", layers: [lay(sym([[0, -115], [25, -115], [60, -60], [78, 85], [40, 10], [0, 90]]))], creases: [[[-25, -115], [0, -60]], [[25, -115], [0, -60]]] },
  { id: "B10", label: "下の辺を中心へ折って開く", layers: [lay(sym([[0, -115], [25, -115], [60, -60], [78, 85], [40, 10], [0, 90]]))], flaps: [{ poly: [[40, 10], [0, 90], [0, 40]], shade: 1, line: [[40, 10], [0, 90]], open: true }], creases: [[[40, 10], [0, 50]], [[-40, 10], [0, 50]]] },
  { id: "B11", label: "両側を中心へ（腕が出る）", layers: [lay(sym([[0, -115], [22, -115], [40, -60], [95, -20], [95, 0], [30, -10], [22, 110], [0, 110]]), 1)], creases: [[[0, -115], [0, 110]]] },
  { id: "B12", label: "真ん中を上へ（縦長の菱形）", layers: [lay(sym([[0, -150], [30, -80], [40, -60], [95, -20], [95, 0], [30, -10], [0, 110]]), 1)], creases: [[[0, -150], [0, 110]]] },
  { id: "B13", label: "小さな辺を基準線へ", layers: [lay(sym([[0, -150], [24, -80], [36, -55], [95, -20], [95, 0], [26, -10], [0, 110]]), 1)], creases: [[[24, -80], [0, -10]], [[-24, -80], [0, -10]]] },
  { id: "B14", label: "両側を同時に折る", layers: [lay(sym([[0, -150], [22, -80], [30, -55], [100, -25], [96, 2], [24, -8], [0, 105]]), 1)], creases: [[[0, -150], [0, 105]]] },
  { id: "B15", label: "角を上へ（腕が斜め下）", layers: [lay(sym([[0, -160], [22, -80], [30, -55], [95, 30], [78, 40], [24, 0], [0, 105]]), 1)], creases: [[[0, -160], [0, 105]]] },
  { id: "B16", label: "裏返して（腕が横へ）", layers: [lay(ARMS_BASE(HEAD_POINT), 0, "torso-b")], flip: true, creases: [[[0, -160], [0, 105]]] },
  { id: "B17", label: "上の角を下へ（四角い頭）", layers: [lay(ARMS_BASE(HEAD_SQ), 0, "torso-b")], flaps: [{ poly: [[-22, -130], [22, -130], [0, -100]], shade: 1, line: [[-22, -130], [22, -130]] }], creases: [[[0, -100], [0, 105]]] },
  { id: "B18", label: "先と横の角も折る（上半身）", layers: [lay(ARMS_BASE(HEAD_CUT), 0, "torso-b"), lay([[-22, -130], [22, -130], [0, -100]], 1)], creases: [[[0, -100], [0, 105]], [[-28, -34], [28, -34]]] },
];

// ---- 組む・仕上げ（紙の人の座標。床が y 0、脚は 150 上げ、体は 270 上げる） ----
export const LEG_AT = -150;
export const BODY_AT = -270;
const legsOf = (poly: Pt[]) => lay(at(poly, 0, LEG_AT), 2);
const bodyOf = (poly: Pt[], dy = 0) => lay(at(poly, 0, BODY_AT + dy), 0, dy ? "torso-j-up" : "torso-j");
const HEAD_NECK: Pt[] = [[-18, -132], [18, -132], [26, -118], [24, -92], [10, -82], [10, -66]];
const HEAD_ANG: Pt[] = [[-14, -134], [14, -134], [28, -116], [22, -94], [10, -84], [10, -66]];
const withHead = (head: Pt[], arm: Pt[]): Pt[] => [...head, ...arm, [26, 105], [-26, 105], ...mx(arm), ...mx(head)];
const ARM_FLAT: Pt[] = [[32, -60], [105, -56], [105, -36], [28, -34]];
const ARM_BENT: Pt[] = [[32, -60], [78, -56], [92, 8], [76, 10], [66, -36], [28, -34]];
const FEET: Pt[] = [[-18, -70], [18, -70], [22, 138], [42, 150], [5, 150], [0, 18], [-5, 150], [-42, 150], [-22, 138]];
const B18 = BODY_STEPS[BODY_STEPS.length - 1];
export const JOIN_STEPS: Step[] = [
  { id: "C1", label: "体を脚にかぶせる", layers: [legsOf(LEGS), bodyOf(B18.layers[0].poly, -22), lay(at(B18.layers[1].poly, 0, BODY_AT - 22), 1)] },
  { id: "C2", label: "左右をはめる（パチン）", layers: [legsOf(LEGS), bodyOf(B18.layers[0].poly), lay(at(B18.layers[1].poly, 0, BODY_AT), 1)], creases: [[at([[-26, 105]], 0, BODY_AT)[0], at([[26, 105]], 0, BODY_AT)[0]]] },
  { id: "F1", label: "頭を開いて首を作る", layers: [legsOf(LEGS), bodyOf(withHead(HEAD_NECK, ARM_FLAT))] },
  { id: "F2", label: "角ばった頭と首", layers: [legsOf(LEGS), bodyOf(withHead(HEAD_ANG, ARM_FLAT))], creases: [[[-10, BODY_AT - 84], [10, BODY_AT - 84]]] },
  { id: "F3", label: "足先を折り返す", layers: [legsOf(FEET), bodyOf(withHead(HEAD_ANG, ARM_FLAT))], creases: [[[-22, -12], [-5, -12]], [[5, -12], [22, -12]]] },
  { id: "F4", label: "ひじを折る", layers: [legsOf(FEET), bodyOf(withHead(HEAD_ANG, ARM_BENT))], creases: [[[66, BODY_AT - 40], [80, BODY_AT - 56]], [[-66, BODY_AT - 40], [-80, BODY_AT - 56]]] },
  { id: "F5", label: "できあがり", layers: [legsOf(FEET), bodyOf(withHead(HEAD_ANG, ARM_BENT))], creases: [[[0, BODY_AT - 84], [0, BODY_AT + 105]], [[-24, -80], [-4, -80]], [[4, -80], [24, -80]]] },
];
export const ALL_STEPS = [...LEG_STEPS, ...BODY_STEPS, ...JOIN_STEPS];

// ---- 形の計算 ----

/** 多角形の向きと始まりをそろえる（画面で時計回り・いちばん上の左の点から）。形を動かすとき、ねじれないように */
function normalize(poly: Pt[]): Pt[] {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    area += x0 * y1 - x1 * y0;
  }
  const p = area < 0 ? [...poly].reverse() : poly;
  let s = 0;
  p.forEach((q, i) => {
    if (q[1] < p[s][1] - 0.01 || (Math.abs(q[1] - p[s][1]) <= 0.01 && q[0] < p[s][0])) s = i;
  });
  return [...p.slice(s), ...p.slice(0, s)];
}
function resample(poly: Pt[], n = 48): Pt[] {
  const p = normalize(poly);
  const lens = p.map((a, i) => Math.hypot(p[(i + 1) % p.length][0] - a[0], p[(i + 1) % p.length][1] - a[1]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const out: Pt[] = [];
  let e = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const want = (i / n) * total;
    while (e < p.length - 1 && acc + lens[e] < want) acc += lens[e++];
    const t = lens[e] ? (want - acc) / lens[e] : 0;
    const a = p[e];
    const b = p[(e + 1) % p.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
const lerp = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
const proj = (p: Pt, [a, b]: [Pt, Pt]): Pt => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
  return [a[0] + dx * u, a[1] + dy * u];
};
/** 折り線を軸に、面を c（1 で元のまま、-1 で裏返しきる）だけ回した形 */
const turn = (poly: Pt[], line: [Pt, Pt], c: number): Pt[] => poly.map((p) => {
  const q = proj(p, line);
  return [q[0] + (p[0] - q[0]) * c, q[1] + (p[1] - q[1]) * c] as Pt;
});
const d = (poly: Pt[]) => `M${poly.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L")}Z`;

/** 手順のあとの紙（開くフラップは残らない） */
const stateOf = (s: Step): Layer[] => [...s.layers, ...(s.flaps ?? []).filter((f) => !f.open)];

/** 1 手順のうち、形が動く割合（残りは止めて見せる） */
export const MOVE = 0.75;
const easeIO = (m: number) => (m < 0.5 ? 2 * m * m : 1 - (-2 * m + 2) ** 2 / 2);

/**
 * 手順の列の、進み p（手順 i を終えた所が i）での絵。
 * 手順 i への動き: 前の紙の層は今の層へ形を変え、フラップは折り線で回る。裏返す手順は、横に縮んで裏の面に替わる
 */
export const Folding: React.FC<{ steps: Step[]; p: number; pattern: string; prev?: Step }> = ({ steps, p, pattern, prev }) => {
  const i = Math.max(0, Math.min(steps.length - 1, Math.floor(p)));
  const step = steps[i];
  const before = i > 0 ? steps[i - 1] : prev;
  const raw = Math.min(1, (p - i) / MOVE);
  const t = before && p < steps.length ? easeIO(raw) : 1;
  const fill = (s: Shade, own?: string) => (s === 0 ? `url(#${own ?? pattern})` : s === 1 ? PAPER_FAR : "#ddd1b2");
  const from = before ? stateOf(before) : step.layers;
  // 前の層を今の層へ（数が違うときは、余った前の層を最後の層へ寄せる）
  const morph = (to: Layer[], src: Layer[], k: number) =>
    Array.from({ length: Math.max(to.length, src.length) }, (_, j) => {
      const a = src[Math.min(j, src.length - 1)];
      const b = to[Math.min(j, to.length - 1)];
      const c = k < 0.5 ? a : b;
      return { poly: lerp(resample(a.poly), resample(b.poly), k), shade: c.shade, fill: c.fill };
    });
  let layers: Layer[];
  let sx = 1;
  if (step.flip) {
    sx = Math.max(0.04, Math.abs(Math.cos(t * Math.PI)));
    layers = t < 0.5 ? from : step.layers;
  } else {
    layers = t >= 1 ? step.layers : morph(step.layers, from, t);
  }
  const flaps = (step.flaps ?? []).map((f) => {
    const pre = turn(f.poly, f.line, -1);
    const k = f.open ? Math.sin(t * Math.PI) : t;
    const c = Math.cos(k * Math.PI);
    const back: Shade = f.shade === 0 ? 1 : f.shade;
    const front: Shade = f.shade === 2 ? 1 : 0;
    return { poly: turn(pre, f.line, c), shade: (c > 0 ? front : back) as Shade, line: f.line, k };
  });
  const showFlaps = flaps.filter((f) => !(t >= 1 && (step.flaps ?? [])[flaps.indexOf(f)]?.open));
  return (
    <g transform={`scale(${sx} 1)`}>
      <g stroke={PAPER_EDGE} strokeWidth={2.2} strokeLinejoin="round">
        {layers.map((l, j) => (
          <path key={j} d={d(l.poly)} fill={fill(l.shade, l.fill)} />
        ))}
        {showFlaps.map((f, j) => (
          <path key={`f${j}`} d={d(f.poly)} fill={fill(f.shade)} />
        ))}
      </g>
      {(t >= 1 || !before ? step.creases ?? [] : []).map(([a, b], j) => (
        <path key={`c${j}`} d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={PAPER_EDGE} strokeWidth={1.4} opacity={0.75} />
      ))}
      {t < 1 &&
        flaps.map((f, j) => (
          <path key={`l${j}`} d={`M${f.line[0][0]} ${f.line[0][1]}L${f.line[1][0]} ${f.line[1][1]}`} stroke={INK} strokeWidth={2} strokeDasharray="5 5" opacity={0.45} />
        ))}
    </g>
  );
};

/** 手順の一覧の 1 枚（全部の手順の、折り終えた形を並べる） */
export const StepsSheet: React.FC = () => {
  const cols = 9;
  const cw = 200;
  const ch = 230;
  return (
    <svg width={cols * cw} height={4 * ch + 20} viewBox={`0 0 ${cols * cw} ${4 * ch + 20}`} style={{ background: "#fff" }}>
      <SheetPatterns />
      {ALL_STEPS.map((s, i) => {
        const x = (i % cols) * cw + cw / 2;
        const y = Math.floor(i / cols) * ch + 112;
        const join = s.id.startsWith("C") || s.id.startsWith("F");
        const steps = s.id.startsWith("L") ? LEG_STEPS : s.id.startsWith("B") ? BODY_STEPS : JOIN_STEPS;
        const k = steps.indexOf(s);
        return (
          <g key={s.id}>
            <rect x={x - cw / 2 + 4} y={y - 108} width={cw - 8} height={ch - 8} rx={8} fill="#faf8f3" stroke="#ddd" />
            <g transform={join ? `translate(${x} ${y + 92}) scale(0.43)` : `translate(${x} ${y}) scale(0.5)`}>
              <Folding steps={steps} p={k + 0.999} pattern={s.id.startsWith("L") ? "sheet-legs" : "sheet-body"} />
            </g>
            <text x={x - cw / 2 + 12} y={y - 86} fontSize={15} fontWeight={700} fill={INK} fontFamily="BIZ UDPGothic, Yu Gothic, sans-serif">
              {s.id}
            </text>
            <text x={x} y={y + 112} fontSize={12} textAnchor="middle" fill="#555" fontFamily="BIZ UDPGothic, Yu Gothic, sans-serif">
              {s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/** 2 枚の紙の面の絵（ぼかした文字の貼り紙）。体の紙だけに赤い見出し。正方形 200 の左上が (-100,-100) */
export const SheetPatterns: React.FC = () => (
  <defs>
    {/* 体の紙の表のうち、胴の前の面にだけ薄い文字（体の紙の座標と、組んだあとの紙の人の座標） */}
    <TorsoPattern id="torso-b" x={-26} y={-34} w={52} h={136} />
    <TorsoPattern id="torso-j" x={-26} y={BODY_AT - 34} w={52} h={136} />
    <TorsoPattern id="torso-j-up" x={-26} y={BODY_AT - 56} w={52} h={136} />
    <filter id="sheet-blur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2" />
    </filter>
    {(["legs", "body"] as const).map((k) => (
      <pattern key={k} id={`sheet-${k}`} patternUnits="userSpaceOnUse" x={-100} y={-100} width={200} height={200}>
        <rect width={200} height={200} fill={PAPER} />
        <g filter="url(#sheet-blur)" opacity={0.85}>
          {k === "body" && <rect x={14} y={14} width={172} height={26} rx={3} fill="#c94a3a" opacity={0.75} />}
          {Array.from({ length: k === "body" ? 5 : 6 }, (_, i) => (
            <g key={i}>
              <circle cx={22} cy={(k === "body" ? 62 : 26) + i * 28} r={3.5} fill="#666" />
              <rect x={32} y={(k === "body" ? 58 : 22) + i * 28} width={i % 3 === 2 ? 100 : 145} height={6} rx={3} fill="#888" />
              <rect x={32} y={(k === "body" ? 68 : 32) + i * 28} width={i % 2 ? 84 : 120} height={4} rx={2} fill="#b3b3b3" />
            </g>
          ))}
        </g>
      </pattern>
    ))}
  </defs>
);
