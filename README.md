# genba-kamishibai

[![test](https://github.com/tirotiro0207/genba-kamishibai/actions/workflows/test.yml/badge.svg)](https://github.com/tirotiro0207/genba-kamishibai/actions/workflows/test.yml)

開発中です。作る過程は [docs/progress.md](docs/progress.md)（進み具合）と [docs/plan.md](docs/plan.md)（作業の表）で見られます。

## 評価データ（`eval/`）

開始前に作った評価データ。元の文は法令と厚生労働省の公開資料から。出典は各行。

- `eval/items_tune_v1r8.json`: 調整に使う 20 個（元の文と、やること・やらないこと・なぜの答え）。監修者 2 名の確認待ちの版で、確定したら差し替えます
- `eval/holdout_hashes_v1r8.json`: 最後の確認だけに使う 10 個のハッシュ。中身は最後の確認のときに足し、ハッシュの一致を見せます
- 30 個の答えは、プロンプトにも例にも入れていません

## 絵のスケッチ（`docs/sketches/`）

作者が手で描いた絵柄の手本。正式な絵の部品（人形・かぶり物・吹き出し・道具）は、これに合わせて直した。

- `mayottara_1.jpg`〜`mayottara_3.jpg`: 「迷ったら、ひとりで決めずに上の人に聞く」の 3 コマ（迷って考える → 指さして聞く → 上の人が答える）
- `alpha_concent.jpg`: 確かめたことを吹き出しで伝える形（コンセント → ✓）
- `shinro.jpg`: 進路図（[docs/compass.md](docs/compass.md)）の描き直し
- 1〜3 と α は、会期前に Claude Code で軽く試した絵柄を見ながら、作者が 11/2 に手で描いた。試作のコードと画像はリポジトリに入れていない
- 写真はメタデータを消し、長い辺を 1,600 px にした
