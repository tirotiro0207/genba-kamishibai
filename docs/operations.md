# 動かし方の細かいこと

README の Quick Start の続き。本番の手順・夜間の一括の道具・CI・本番へ写す道具・テストと録画の置き場を書く。決めた理由は [decisions.md](decisions.md)、口の説明は [api.md](api.md)。

## Worker の名前と本番の手順

- 手元の Worker の名前は `genba-kamishibai-local`（`wrangler.jsonc` の上の段）。`--env production` を付け忘れて出しても、本番の Worker に手元用の D1 と置き場が載らないように分けた
- 本番は `npx wrangler deploy --env production` で出し、名前は `genba-kamishibai` のまま。DB は `genba-kamishibai-prod`、置き場は `genba-kamishibai-prod-files`
- 本番の D1 に表の変更を当てるのは作者: `npx wrangler d1 migrations apply DB --remote --env production`。11/7 の点検の直しで `0029_guards.sql`・`0030_posts_morning.sql`・`0031_company_words_ruby.sql` を足した（中身は [api.md](api.md) の「表」）。点検の直しの束では本番に触っていない
- 本番の MCP の鍵は、作者が `npx tsx scripts/add-mcp-key.ts <会社> --remote` で作り、本番の `/mcp/<テナント>` に鍵で入れることを確かめる（まだ確かめていない）

## 本番の公開の置き場（PUBLIC_DEMO）で通すもの

- 練習用と架空の会社は見るだけ。POST で通すのは、カードを開いた印（`/cards/:id/open`）・役割で入る（`/login`）・新入社員が見た印（`/read/cards/:id/seen`）と、公開デモの「その場で作る」（`/api/demo/make`）だけ
- 試しの回（`/trials` の加わる・答え）の書き込みは通さない。会場の試しは会社のテナントで行う
- MCP は練習用・架空の会社も鍵が要り、使えるのは `list_documents` と `get_card` だけ（README の `/mcp/demo` の例は手元の環境の話）

## 夜間の一括の道具

- `scripts/night-draft.ts`
  - `--shard i/n` は `--sub`（claude -p で流す確かめ）のときだけで、`--max` とは組めない
  - 同じ `--run` の番号を別のテナントで使うと、始める前に断る（進み具合の表の主キーにテナントが入っていないため）
  - `--estimate` は API を呼ばず見込みだけを出す。取り出しの見込みは 1 ページ 0.143 USD（深さ high の実測）
  - 夜間の作成は脚本なし（作る係の既定）なので、新人役の試しの「場を抜いた版」は今は効かない。ログに「抜けない（脚本なし）」「（全部のコマだけ）」と出る。効かせるには makeCard に `{ script: true }` を渡す。1 枚の費用が上がるので、作者が決める
- `scripts/night-sort.ts`: `--fake`（決まった答えを返す確かめ）は `--remote` と組めない（本番には書かない）
- 指示のハッシュ（`system_sha`）が無い今の `private/ma/ids.json` では、次に night-sort を API で流したときに、エージェントが 1 回作り直される（環境は使い回す）

## 本番へ写す道具

- `scripts/copy-demo-prod.ts`: 本番の架空の会社に監査の記録が 1 行でもあると止まる（記録はハッシュの連鎖で、番号のぶつかる行だけが捨てられると連鎖が切れるため）
- `scripts/copy-cards-prod.ts`: 用語表（glossary・company_words）と ○× の組（card_pairs）は写さない。本番で要るなら別に写す

## CI

- `.github/workflows/test.yml`。push は main だけで走り、PR でも走る
- Ubuntu に `fonts-noto-cjk` を入れ、`EXPORT_FONT` で字形の場所を渡す（書き出しの PNG の帯に日本語を描くため）
- 型（`npx tsc`。`tsconfig.json` は src・tests・e2e・scripts を見て、lib は ES2024）と、動画（`video/`）の型と、単体テスト（vitest）を流す。録画のテスト（Playwright）は流さない

## テストと録画

- 【手元限定】の付いたテストは、`private/` の中のファイルやマニュアルの PDF が無いと飛ぶ（CI ではいつも飛ぶ）
- 録画のテストは、`E2E_RUNS` を付けずに流すと `private/rec/runs-<年月日-時分秒>` の新しい置き場に録画する（前の録画を消さない）。古い `private/rec/runs` は、新しくは使われない
- 開発用の画面 `#/picto/poses`（姿勢の一覧）は、どの画面からもリンクしていない。`e2e/poses.spec.ts` と総点検の見回り（`e2e/sweep.spec.ts`）が開く
