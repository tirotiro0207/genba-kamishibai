// 読み手パネルの「元の文を読ませた側」（057）。絵の側と比べるための参考で、同じ読み手に、カードの元になった資料の文を
// そのまま読ませて同じ問いに答えさせる。絵の側の指示（prompt.ts）は文を受け取らないので、文の側はこの別の関数で作る。
import { orderFor, PANEL_MODELS, type PanelRun } from "./prompt";
import { describeReader, type Reader } from "./readers";

export interface PanelText {
  /** 読み手に見せる名前（「文 1」など）。カードの ID や中身が分かる名前にしない */
  label: string;
  /** 資料の元の文（そのまま） */
  text: string;
}

export function readerTextPrompt(run: PanelRun, reader: Reader, texts: PanelText[]): string {
  const ordered = orderFor(run.seed, reader.id, texts.map((t) => ({ label: t.label, path: t.text }))).map((p) => ({ label: p.label, text: p.path }));
  const m = PANEL_MODELS[run.model];
  return `あなたは、電気工事の会社に入ったばかりの新入社員として、仕事の決まりが書かれた資料の文を読みます。

## あなたの設定
${describeReader(reader)}

この設定にある事実だけを手がかりにしてください。設定に書いていないことは足さないでください。日本語の文字を読む力が設定より上のように読まないでください（読めない字は読めないものとして答える）。

## やること
次の文を、上から順に 1 つずつ読んでください。ほかには何も読まないでください（ファイル、ほかの読み手の答え、絵は開かない）。

${ordered.map((t) => `### ${t.label}\n${t.text}`).join("\n\n")}

文ごとに、文だけから分かることを、やさしい日本語で答えてください。
- do: この文は、何をしなさいと言っていると思うか
- dont: 何をしてはいけないと言っていると思うか（無ければ空にする）
- why: なぜそうするのだと思うか（分からなければ空にする）
- sure: どれくらい自信があるか（1 = ほとんど分からない 〜 5 = はっきり分かる）

## 答えの書き方
答えは次の JSON だけを、Write ツールで ${run.answersDir}/${reader.id}.json に書いてください。ほかのファイルは書かないでください。

{"run": "${run.runId}", "reader": "${reader.id}", "model": "${m.id}", "answers": [{"label": "文 1", "do": "…", "dont": "…", "why": "…", "sure": 3}]}

answers には、読んだ文を全部、読んだ順番で入れてください。
`;
}
