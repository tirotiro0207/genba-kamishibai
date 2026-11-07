# API のメモ

置き場（Worker）の口のうち、画面から呼ばない口と、11/7 に足した口・変えた口だけを書く。全部の口の一覧ではない（全部はコードの `src/worker/*.ts` のルート）。
口の頭は `/api/t/<テナント>`。役割の欄は、会社のテナントで要る役割のしるし。

## 画面から呼ばない口（内部用）

テスト・スクリプト・MCP・これからの画面のために残している。画面には入口が無い。

| 口 | 何をする | 使っている所 |
|---|---|---|
| `GET /cards/glossary` | 用語表を読む | テスト・スクリプト・MCP |
| `PUT /cards/glossary` | 用語表を書く（11/7 に足した） | テスト・スクリプト |
| `GET /cards/:id/signature` | カードの署名の行を読む | テスト・スクリプト |
| `POST /cards` | カードを直に作る（取り出しを通さない） | テスト・スクリプト・MCP |
| `POST /trials/:id/items` | 試しの回の 2 項目（A・B）の元のページの訳を入れる。画面が無く、API でだけ入れる | 手で呼ぶ |
| `GET /issue/samples` | 週の抜き取りの一覧（発行の管理の画面は `POST /issue/sample` で今週の分を作るか読む） | テスト |
| `GET /read/cards/:id` | 新入社員が 1 枚を読む。読む画面は一覧（`GET /read/cards`）だけを読む | テスト |

- ○× の組（093a）は、組を書く口と一覧の口だけ。読む口（`/read/cards`）が組（`pair`）を返すが、読む画面ではまだ出していない。新入社員が読む側への接続は持ち越し
- 開発用の画面 `#/picto/poses`（姿勢の一覧・PoseGallery）は、どの画面からもリンクしていない。`e2e/poses.spec.ts` と総点検の見回り（sweep）が開く

## 11/7 に足した口（新しい型・作者の確認待ち）

| 口 | 役割 | 何をする |
|---|---|---|
| `PUT /cards/:id/weight` | 監修者 | カードの重さ（命に関わる・ふつう）を決める。本文に入るので版が上がる。署名済み・止めたカードでは変えられない |
| `POST /cards/:id/accident` | 決めていない（文の直しと同じで、役割で絞っていない） | 「なぜ」の出どころに過去の事故（何が・原因・いつ）を足す。版が上がる。署名済みなら署名が外れて回収の知らせが出る |
| `POST /extract/:id/make` | 作る側 | 取り出しから 1 枚を作る。`shape`（principle なら原則の 1 コマ）を受ける |
| `POST /issue/posts`・`GET /issue/posts` | 監修者・教育担当 | 署名済みで指紋が合うカードを貼った場所を記録する・一覧を読む（追記だけ） |
| `POST /issue/posts/:id/removed` | 監修者・教育担当 | はがした時刻を 1 回だけ書く |
| `POST /issue/samples/:week/:card/reviewed` | 割り当てられた監修者 | 週の抜き取りのカードを見直した印を付ける（1 枚 1 回だけ。状態の行にも残る） |
| `GET /issue/morning/suggest` | 監修者・教育担当 | その日の作業の言葉から、合いそうな署名済みのカードを最大 8 枚出す（命に関わるカードを先に） |
| `POST /issue/morning`・`GET /issue/morning` | 監修者・教育担当 | 朝礼の組を残す・読む（追記だけ） |

- 読む口（`/read/cards`）は、束のカードを束の最初の 1 枚の場所に順に並べ、`pair`（○× の組）も返す
- `GET /audit/cards/:id` から `chain_ok` を外した。記録の連鎖は `GET /audit/verify` で別に 1 回だけ確かめる（画面は「確かめ中…」と出してから結果を出す）

## 置き場（資料のファイル）の返し方

- 画像・PDF・JSON・文字・CSV のほかは、`application/octet-stream` のダウンロードとして返し、`X-Content-Type-Options: nosniff` を付ける
- `?prefix=pdf` は `pdf/` の中だけを並べる

## 表（migrations）

- `0029_guards.sql`: 追記だけの表の守りをそろえた。絵だけの答えの「消す」書き換えは、まだ消していない行を空にするときだけ通す。試しの回と取り出しの記録は、データを戻す間のほかは消せない。取り出しの OK は取り出しごとに最後の 1 行を引く
- `0030_posts_morning.sql`: 貼った場所（`card_posts`）・週の抜き取りの見直しの印（`sample_reviews`）・朝礼の組（`morning_sets`）。どれも追記だけ（消すのはデータを戻す間だけ）
- `0031_company_words_ruby.sql`: 会社の言葉のうち、人の直しから積んだ行で、ふりがなの記法（｜《》）を含む行を消す掃除。ふりがなを付けただけの直しが言い換えとして積まれていた
- 本番の D1 にこの 3 つを当てるのは作者（`npx wrangler d1 migrations apply DB --remote --env production`）。点検の直しの束では本番に触っていない。手順は [operations.md](operations.md)
