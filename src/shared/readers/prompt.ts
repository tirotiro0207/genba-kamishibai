// 読み手パネルの指示の型（027）。1 人の読み手 = 1 つの Claude Code のサブエージェント。API のクレジットは使わない。
// 渡すのは読み手の設定と絵のファイルだけ。カードの文・元の文・ほかの読み手の答えは渡さない（この関数は文を受け取らない）。
import { rng } from "../assign";
import { describeReader, type Reader } from "./readers";

// ▼ 回すときのモデル。Opus 5.5 で回すときはここを "opus" にする（ここ 1 か所だけ）
export const PANEL_MODEL: PanelModel = "sonnet";

export type PanelModel = "sonnet" | "opus";
/** サブエージェントの model に渡す名前と、結果に残すモデルの ID */
export const PANEL_MODELS: Record<PanelModel, { agent: PanelModel; id: string }> = {
  sonnet: { agent: "sonnet", id: "claude-sonnet-5-5" },
  opus: { agent: "opus", id: "claude-opus-5-5" },
};

export interface PanelPicture {
  /** 読み手に見せる名前（「絵 1」など）。カードの ID や中身が分かる名前にしない */
  label: string;
  /** 絵の PNG の絶対パス */
  path: string;
}

/** 読み手ごとに絵の順番を混ぜる。同じ種・同じ読み手なら同じ順番 */
export function orderFor(seed: string, readerId: string, pictures: PanelPicture[]): PanelPicture[] {
  const out = [...pictures];
  const r = rng(`${seed}:${readerId}`);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface PanelRun {
  runId: string;
  seed: string;
  model: PanelModel;
  /** 答えを書くフォルダ（private/readers/<回>/answers） */
  answersDir: string;
  /** 絵の開き方。one = 1 枚ずつ（既定）、together = 全部を 1 回のメッセージでまとめて開く（11/6。30 枚で使用量を 10 分の 1 にする） */
  reading?: "one" | "together";
}

export function readerPrompt(run: PanelRun, reader: Reader, pictures: PanelPicture[]): string {
  const ordered = orderFor(run.seed, reader.id, pictures);
  const m = PANEL_MODELS[run.model];
  return `あなたは、電気工事の会社に入ったばかりの新入社員として、仕事の決まりを描いた絵のカードを見ます。

## あなたの設定
${describeReader(reader)}

この設定にある事実だけを手がかりにしてください。設定に書いていないことは足さないでください。

## やること
${run.reading === "together" ? "次の絵を全部、1 回のメッセージの中で Read ツールを絵の数だけ並べて、まとめて開いて見てください。" : "次の絵を、上から順に 1 枚ずつ Read ツールで開いて見てください。"}絵のほかには何も読まないでください（ほかのファイル、ほかの読み手の答え、カードの文や資料は開かない）。

${ordered.map((p) => `- ${p.label}: ${p.path}`).join("\n")}

絵ごとに、絵だけから分かることを、やさしい日本語で答えてください。
- do: この絵は、何をしなさいと言っていると思うか
- dont: 何をしてはいけないと言っていると思うか（無ければ空にする）
- why: なぜそうするのだと思うか（分からなければ空にする）
- sure: どれくらい自信があるか（1 = ほとんど分からない 〜 5 = はっきり分かる）

## 答えの書き方
答えは次の JSON だけを、Write ツールで ${run.answersDir}/${reader.id}.json に書いてください。ほかのファイルは書かないでください。

{"run": "${run.runId}", "reader": "${reader.id}", "model": "${m.id}", "answers": [{"label": "絵 1", "do": "…", "dont": "…", "why": "…", "sure": 3}]}

answers には、見た絵を全部、見た順番で入れてください。
`;
}

export interface ReaderAnswer {
  label: string;
  do: string;
  dont: string;
  why: string;
  sure: number;
}
export interface ReaderResult {
  run: string;
  reader: string;
  model: string;
  answers: ReaderAnswer[];
}

/** 読み手の答えを確かめる。どのモデルで回したかが無い・違う答えは受け付けない */
export function parseReaderResult(raw: unknown, run: PanelRun, reader: Reader, pictures: PanelPicture[]): ReaderResult {
  const r = raw as ReaderResult;
  const want = PANEL_MODELS[run.model].id;
  if (!r || r.run !== run.runId || r.reader !== reader.id) throw new Error(`${reader.id}: 回か読み手が違う`);
  if (r.model !== want) throw new Error(`${reader.id}: モデルが ${want} ではない（${String(r.model)}）`);
  if (!Array.isArray(r.answers)) throw new Error(`${reader.id}: answers が無い`);
  const labels = new Set(pictures.map((p) => p.label));
  const seen = new Set<string>();
  for (const a of r.answers) {
    if (!labels.has(a.label) || seen.has(a.label)) throw new Error(`${reader.id}: 知らない絵か二重の答え（${a.label}）`);
    seen.add(a.label);
    if (typeof a.do !== "string" || typeof a.dont !== "string" || typeof a.why !== "string") throw new Error(`${reader.id}: ${a.label} の答えの形が違う`);
    if (!Number.isInteger(a.sure) || a.sure < 1 || a.sure > 5) throw new Error(`${reader.id}: ${a.label} の sure が 1〜5 ではない`);
  }
  if (seen.size !== labels.size) throw new Error(`${reader.id}: 答えていない絵がある（${seen.size} / ${labels.size}）`);
  return r;
}
