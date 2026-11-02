// 経路とカードのデータの形（019）。
// 1 枚のカードは 3〜4 コマを持ち、その元の動きも残す。動きは種類つき（キーフレームの JSON か、AI が書いた動きの HTML）で、
// 絵の作り方を変えてもカードの形は変えずに済むようにする。コマは時刻と、切り出した PNG の置き場の鍵。
// 絵の部品 → カードの文 → 元の文の位置（資料のページと行、または話した言葉）の経路を部品ごとに必ず持つ。
import { type MotionJson, validateMotion } from "./picto/motion";

/** 元の文の位置。監査の記録 ① と同じ形 */
export type SourceRef =
  | { kind: "doc"; doc: string; page: number; line: number; line_end?: number }
  | { kind: "speech"; input: string; start: number; end: number };

/** カードの文（守ること・なぜ）を 1 文ずつに分けたもの。どれも元の文の位置を 1 つ以上持つ */
export interface Statement {
  id: string;
  field: "rule" | "why";
  text: string;
  sources: SourceRef[];
}

/**
 * 絵の部品。target は、キーフレームなら figures か props の何番目か、HTML なら data-part の名前。
 * statement はどの文から描いたか
 */
export interface CardPart {
  id: string;
  target: { type: "figure" | "prop"; index: number } | { type: "element"; name: string };
  statement: string;
  /** なぜそう描いたか（経路の画面で出す） */
  reason: string;
}

export interface CardBody {
  rule: string;
  why: string;
  /** 言葉の欄（036 で埋める）。やさしい日本語と母語 */
  words?: { ja: string; vi: string };
  statements: Statement[];
  motion: CardMotion;
  /** 3〜4 コマ。png は切り出した PNG の置き場の鍵（まだ切り出していなければ無い） */
  frames: { t: number; png?: string }[];
  parts: CardPart[];
}

export type CardMotion = { kind: "keyframes"; json: MotionJson } | { kind: "html"; html: string; duration: number };

export const FRAMES_MIN = 3;
export const FRAMES_MAX = 4;
const HTML_MAX = 200_000;

/** HTML の動きの中の部品の名前（data-part="..."） */
export const htmlPartNames = (html: string) => [...new Set([...html.matchAll(/data-part\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]))];

export const STATUSES = ["draft", "ai_draft", "pending", "ok", "signed", "stopped"] as const;
export type CardStatus = (typeof STATUSES)[number];

/** 画面に出す名前 */
export const STATUS_LABEL: Record<CardStatus, string> = {
  draft: "未承認の下書き",
  ai_draft: "AI 下書き",
  pending: "確認待ち",
  ok: "OK",
  signed: "署名済み",
  stopped: "停止",
};

/**
 * 許される移り方。下書きは作り直せる（draft へ戻る）。署名済みからは停止だけ。
 * 停止したカードは直すときに下書きへ戻し、もう一度確かめて署名する
 */
export const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  draft: ["ai_draft", "pending"],
  ai_draft: ["pending", "draft"],
  pending: ["ok", "draft", "ai_draft"],
  ok: ["signed", "draft"],
  signed: ["stopped"],
  stopped: ["draft"],
};

export const canMove = (from: CardStatus, to: CardStatus) => TRANSITIONS[from]?.includes(to) ?? false;

const isInt = (n: unknown, min = 0) => typeof n === "number" && Number.isInteger(n) && n >= min;
const isStr = (s: unknown, max = 2000) => typeof s === "string" && s.trim().length > 0 && s.length <= max;

export function validateSource(s: SourceRef): string[] {
  if (s?.kind === "doc") {
    const e: string[] = [];
    if (!isStr(s.doc, 200)) e.push("doc が要る");
    if (!isInt(s.page, 1)) e.push("page は 1 以上の整数");
    if (!isInt(s.line, 1)) e.push("line は 1 以上の整数");
    if (s.line_end !== undefined && !(isInt(s.line_end, 1) && s.line_end >= s.line)) e.push("line_end は line 以上");
    return e;
  }
  if (s?.kind === "speech") {
    const e: string[] = [];
    if (!isStr(s.input, 200)) e.push("input が要る");
    if (!(isInt(s.start) && isInt(s.end) && s.end > s.start)) e.push("start < end の整数");
    return e;
  }
  return ["kind は doc か speech"];
}

/** カードの形と経路の検査。問題の一覧を返す（空なら通る） */
export function validateCard(c: CardBody): string[] {
  if (!c || typeof c !== "object") return ["カードが無い"];
  const errs: string[] = [];
  if (!isStr(c.rule)) errs.push("rule（守ること）が要る");
  if (!isStr(c.why)) errs.push("why（なぜ）が要る");
  if (c.words !== undefined && !(isStr(c.words?.ja) && isStr(c.words?.vi))) errs.push("words は ja と vi が要る");

  const sts = Array.isArray(c.statements) ? c.statements : [];
  if (!sts.length) errs.push("statements が要る");
  const stIds = new Set<string>();
  sts.forEach((s, i) => {
    if (!isStr(s?.id, 40) || stIds.has(s.id)) errs.push(`statements[${i}].id が空か重なる`);
    stIds.add(s?.id);
    if (s?.field !== "rule" && s?.field !== "why") errs.push(`statements[${i}].field は rule か why`);
    if (!isStr(s?.text)) errs.push(`statements[${i}].text が要る`);
    if (!Array.isArray(s?.sources) || !s.sources.length) errs.push(`statements[${i}] に元の文の位置が無い`);
    else s.sources.forEach((r, j) => validateSource(r).forEach((e) => errs.push(`statements[${i}].sources[${j}]: ${e}`)));
  });
  for (const f of ["rule", "why"] as const) if (sts.length && !sts.some((s) => s?.field === f)) errs.push(`${f} の文が statements に無い`);

  // 動きとコマ
  const mo = c.motion;
  let targets: string[] = [];
  if (mo?.kind === "keyframes") {
    const m = validateMotion(mo.json);
    if (m.length) return [...errs, ...m.map((e) => `motion: ${e}`)];
    const firstKey = mo.json.keyframes[0];
    targets = [...firstKey.figures.map((_, j) => `figure:${j}`), ...firstKey.props.map((_, j) => `prop:${j}`)];
    const marks = mo.json.keyframes.filter((k) => k.mark).map((k) => k.t);
    if (Array.isArray(c.frames) && canonicalTimes(c.frames) !== canonicalTimes(marks.map((t) => ({ t })))) errs.push("frames の時刻が動きの印と合わない");
  } else if (mo?.kind === "html") {
    if (!isStr(mo.html, HTML_MAX)) errs.push("motion.html が要る");
    if (!(typeof mo.duration === "number" && mo.duration > 0 && mo.duration <= 60)) errs.push("motion.duration は 0〜60 秒");
    targets = typeof mo.html === "string" ? htmlPartNames(mo.html).map((n) => `element:${n}`) : [];
    if (!targets.length) errs.push("motion.html に data-part の部品が無い");
  } else errs.push("motion.kind は keyframes か html");
  const fr = Array.isArray(c.frames) ? c.frames : [];
  if (fr.length < FRAMES_MIN || fr.length > FRAMES_MAX) errs.push(`コマは ${FRAMES_MIN}〜${FRAMES_MAX}: ${fr.length}`);
  fr.forEach((f, i) => {
    if (!(typeof f?.t === "number" && f.t >= 0)) errs.push(`frames[${i}].t が要る`);
    if (i > 0 && !(f?.t > fr[i - 1]?.t)) errs.push(`frames[${i}].t が前より後ではない`);
    if (f?.png !== undefined && !isStr(f.png, 300)) errs.push(`frames[${i}].png が空`);
  });

  // 部品ごとの経路
  const parts = Array.isArray(c.parts) ? c.parts : [];
  const known = new Set(targets);
  const covered = new Set<string>();
  const partIds = new Set<string>();
  parts.forEach((p, i) => {
    if (!isStr(p?.id, 40) || partIds.has(p.id)) errs.push(`parts[${i}].id が空か重なる`);
    partIds.add(p?.id);
    const key = targetKey(p?.target);
    if (!key || !known.has(key)) errs.push(`parts[${i}].target が絵の部品を指していない`);
    else covered.add(key);
    if (!stIds.has(p?.statement)) errs.push(`parts[${i}].statement がカードの文を指していない`);
    if (!isStr(p?.reason, 500)) errs.push(`parts[${i}].reason（なぜそう描いたか）が要る`);
  });
  // 経路の無い部品は保存できない
  for (const t of targets) if (!covered.has(t)) errs.push(`${t.replace(/^(\w+):(.*)$/, (_, a, b) => (a === "element" ? `部品 ${b}` : `${a}s[${b}]`))} に経路が無い`);
  return errs;
}

const canonicalTimes = (fs: { t: number }[]) => fs.map((f) => f?.t).join(",");

function targetKey(t: CardPart["target"] | undefined): string | null {
  if (t?.type === "figure" || t?.type === "prop") return isInt(t.index) ? `${t.type}:${t.index}` : null;
  if (t?.type === "element") return isStr(t.name, 80) ? `element:${t.name}` : null;
  return null;
}

/** 部品 → 文 → 元の文の位置を辿る（経路の画面と監査の記録 ① で使う） */
export function routeOf(c: CardBody, partId: string): { part: CardPart; statement: Statement; sources: SourceRef[] } | null {
  const part = c.parts.find((p) => p.id === partId);
  const statement = part && c.statements.find((s) => s.id === part.statement);
  return part && statement ? { part, statement, sources: statement.sources } : null;
}
