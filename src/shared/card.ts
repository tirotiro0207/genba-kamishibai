// 経路とカードのデータの形（019）。
// 1 枚のカードは 3〜4 コマを持ち（原則の 1 コマのカードは 1 コマ・11/7）、その元の動きも残す。動きは種類つき（キーフレームの JSON か、AI が書いた動きの HTML）で、
// 絵の作り方を変えてもカードの形は変えずに済むようにする。コマは時刻と、切り出した PNG の置き場の鍵。
// 絵の部品 → カードの文 → 元の文の位置（資料のページと行、または話した言葉）の経路を部品ごとに必ず持つ。
import { type MotionJson, validateMotion } from "./picto/motion";
import { bareKanji, brokenRuby } from "./ruby";

/**
 * 元の文の位置。監査の記録 ① と同じ形。
 * accident は過去の事故と原因（11/7 既定・作者の確認待ち）: いつ（date。分からなければ無し）・何が（title）・原因（cause）。
 * カードの「なぜ」の出どころとして選べる
 */
export type SourceRef =
  | { kind: "doc"; doc: string; page: number; line: number; line_end?: number }
  | { kind: "speech"; input: string; start: number; end: number }
  | { kind: "accident"; title: string; cause: string; date?: string };

/** カードの文（守ること・なぜ）を 1 文ずつに分けたもの。どれも元の文の位置を 1 つ以上持つ */
export interface Statement {
  id: string;
  field: "rule" | "why";
  text: string;
  sources: SourceRef[];
  /** 元の文に無いことを AI が書いた文（理由など）。sources はその文の根拠にした元の位置。035 で「AI 下書き」に落とす */
  ai?: boolean;
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
  /**
   * 言葉の欄（036 で埋める）。やさしい日本語と、作れたときだけ母語（vi）。
   * 訳は新入社員にも監修者にも出さない（11/5 の決定）ので、vi は無くてよい。前に作った訳のデータは消さずに残す
   */
  words?: { ja: string; vi?: string };
  statements: Statement[];
  motion: CardMotion;
  /** 3〜4 コマ。png は切り出した PNG の置き場の鍵（まだ切り出していなければ無い） */
  frames: { t: number; png?: string }[];
  parts: CardPart[];
  /** 脚本（11/5〜。絵の数字の前に書かせた話の筋）。前に作ったカードには無い */
  script?: CardScript;
  /**
   * 束（11/7 既定）: 1 つの決まり（点検表など）を何枚かに分けた組の 1 枚。id は束ごとに同じ、order は 1 から、total は束の枚数、
   * parent は親の決まりの文。本文に入るので指紋に入る。前に作ったカードには無い（束でない 1 枚として読む）
   */
  bundle?: CardBundle;
  /**
   * 重さ（11/7 既定）: life は命に関わる、normal はそれ以外。監修者が確認・署名の前に決める。本文に入るので指紋に入る。
   * 前に作った署名済みのカードには書き足さない（書くと指紋が変わって閲覧から外れる）。無ければ normal として出す
   */
  weight?: CardWeight;
  /**
   * 形（11/7 既定）: principle は原則の 1 コマ（コマ 1 つ）、story はふつうの 3〜4 コマ。無ければ story
   */
  shape?: CardShape;
}

export interface CardBundle {
  id: string;
  order: number;
  total: number;
  parent: string;
}
export const WEIGHTS = ["life", "normal"] as const;
export type CardWeight = (typeof WEIGHTS)[number];
export const WEIGHT_LABEL: Record<CardWeight, string> = { life: "命に関わる", normal: "それ以外" };
/** 無い重さは normal として読む */
export const weightOf = (c: Pick<CardBody, "weight"> | null | undefined): CardWeight => (c?.weight === "life" ? "life" : "normal");
export const SHAPES = ["principle", "story"] as const;
export type CardShape = (typeof SHAPES)[number];
export const isPrinciple = (c: Pick<CardBody, "shape"> | null | undefined) => c?.shape === "principle";
/** 束の枚数の上限（点検表の項目の数の目安） */
export const BUNDLE_MAX = 30;

/** 脚本（src/shared/make/script.ts）。物語（コマに縛らない話の筋）と、それを 3〜4 コマに移したコマ割り */
export interface CardScript {
  /** 1 段目の物語 */
  story?: { takeaway: string; peak_picture: string; result_picture: string; setting: string; beats: { what: string; viewer: string }[]; why_shown: string; time: string | null; avoid: string[] };
  /** 物語の場面をどうまとめ・落としたか */
  merged?: string;
  trigger: string;
  /** role はコマの役（場・きっかけ・山場・結果）。11/5 の 2 回目より前の脚本には無い */
  frames: { role?: string; who: string; action: string; viewer: string }[];
  why_shown: string;
  avoid: string[];
  /** 描ける部品だけで見せられるか。false のときは missing に足りない物 */
  drawable: boolean;
  missing: string | null;
}

export type CardMotion = { kind: "keyframes"; json: MotionJson } | { kind: "html"; html: string; duration: number };

export const FRAMES_MIN = 3;
export const FRAMES_MAX = 4;
/** 原則の 1 コマのカードのコマの数 */
export const PRINCIPLE_FRAMES = 1;
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
 * 状態の欄を直に動かすときに許される移り方（状態を変える呼び出しが canMove で見る）。下書きは作り直せる（draft へ戻る）。
 * 状態の欄を直に動かすときは、署名済みからは停止だけ。停止したカードは直すときに下書きへ戻し、もう一度確かめて署名する。
 * 中身を直す道（直す・作り直す・やり直す・元に戻す）はこの表を通らない。11/5 の決定で、署名済みも直せ、直すと版が上がって
 * 下書き（AI が書いた文が残っていれば AI 下書き）へ戻り、前の版に回収の知らせが出る（worker の reopenOnEdit）。
 * 11/5（作者）: ホームのカードの管理から、署名の前のカードも止められるようにした（使わないと決めた下書きを一覧で分けるため）
 * 誰が移せるかはこの表ではなく worker の関所（cardsGate）が見る: 止める（stopped）のは監修者だけで、止める理由は必ず要る（空なら 400）。
 * 署名（signed）はこの呼び出しでは移せず、署名の記録からだけ入る
 */
export const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  draft: ["ai_draft", "pending", "stopped"],
  ai_draft: ["pending", "draft", "stopped"],
  pending: ["ok", "draft", "ai_draft", "stopped"],
  ok: ["signed", "draft", "stopped"],
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
  if (s?.kind === "accident") {
    const e: string[] = [];
    if (!isStr(s.title, 200)) e.push("title（何が起きたか）が要る");
    if (!isStr(s.cause, 500)) e.push("cause（原因）が要る");
    if (s.date !== undefined && !(typeof s.date === "string" && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s.date))) e.push("date は YYYY・YYYY-MM・YYYY-MM-DD のどれか");
    return e;
  }
  return ["kind は doc か speech か accident"];
}

/** カードの形と経路の検査。問題の一覧を返す（空なら通る） */
export function validateCard(c: CardBody): string[] {
  if (!c || typeof c !== "object") return ["カードが無い"];
  const errs: string[] = [];
  if (!isStr(c.rule)) errs.push("rule（守ること）が要る");
  if (!isStr(c.why)) errs.push("why（なぜ）が要る");
  if (c.words !== undefined) {
    if (!isStr(c.words?.ja)) errs.push("words は ja が要る");
    if (c.words?.vi !== undefined && !(typeof c.words.vi === "string" && c.words.vi.length <= 2000)) errs.push("words.vi は 2000 字までの文");
  }
  if (c.weight !== undefined && !WEIGHTS.includes(c.weight)) errs.push("weight は life か normal");
  if (c.shape !== undefined && !SHAPES.includes(c.shape)) errs.push("shape は principle か story");
  if (c.bundle !== undefined) errs.push(...bundleErrors(c.bundle));
  const principle = c.shape === "principle";

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
    const m = validateMotion(mo.json, { single: principle });
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
  if (principle) {
    if (fr.length !== PRINCIPLE_FRAMES) errs.push(`原則の 1 コマのカードはコマ ${PRINCIPLE_FRAMES} つ: ${fr.length}`);
  } else if (fr.length < FRAMES_MIN || fr.length > FRAMES_MAX) errs.push(`コマは ${FRAMES_MIN}〜${FRAMES_MAX}: ${fr.length}`);
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

/**
 * 言葉の欄のやさしい日本語の、ふりがなの検査（docs/yasashii-nihongo.md「残した漢字には、すべてふりがな」）。
 * AI の答えは words.ts で確かめているので、人が直した文も同じ決まりで見る。問題の一覧を返す（空なら通る）。
 * before を渡すと、words.ja が変わったときだけ見る（決まりより前に作ったカードを、ほかの欄の直しや元に戻すで止めない）
 */
export function wordsRubyErrors(c: CardBody, before?: CardBody): string[] {
  const ja = c?.words?.ja;
  if (typeof ja !== "string" || (before && before.words?.ja === ja)) return [];
  const errs: string[] = [];
  const bare = bareKanji(ja);
  if (bare.length) errs.push(`words.ja にふりがなの無い漢字がある: ${bare.join("・")}（「｜漢字《よみ》」でふりがなを付けるか、ひらがなにする）`);
  if (brokenRuby(ja)) errs.push("words.ja のふりがなの書き方が崩れている（「｜漢字《よみ》」の形にする）");
  return errs;
}

/** 束の検査 */
export function bundleErrors(b: CardBundle): string[] {
  if (!b || typeof b !== "object") return ["bundle は形（オブジェクト）"];
  const e: string[] = [];
  if (!isStr(b.id, 80)) e.push("bundle.id が要る（80 字まで）");
  if (!isInt(b.total, 1) || b.total > BUNDLE_MAX) e.push(`bundle.total は 1〜${BUNDLE_MAX}`);
  if (!isInt(b.order, 1) || (isInt(b.total, 1) && b.order > b.total)) e.push("bundle.order は 1 から total まで");
  if (!isStr(b.parent)) e.push("bundle.parent（親の決まりの文）が要る");
  return e;
}

/** 束の順に並べる（束でないカードは元の順のまま、束は最初の 1 枚の場所に order の順でまとめる） */
export function bundleSort<T>(items: T[], bodyOf: (x: T) => { bundle?: CardBundle | null } | null): T[] {
  const groups = new Map<string, T[]>();
  const slots: (T[] | T)[] = [];
  const singles: boolean[] = [];
  for (const x of items) {
    const id = bodyOf(x)?.bundle?.id;
    if (!id) {
      slots.push(x);
      singles.push(true);
      continue;
    }
    let g = groups.get(id);
    if (!g) {
      g = [];
      groups.set(id, g);
      slots.push(g);
      singles.push(false);
    }
    g.push(x);
  }
  const order = (x: T) => bodyOf(x)?.bundle?.order ?? 0;
  return slots.flatMap((s, i) => (singles[i] ? [s as T] : (s as T[]).slice().sort((a, b) => order(a) - order(b))));
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
